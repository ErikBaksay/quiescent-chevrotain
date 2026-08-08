import { Component, inject, signal } from '@angular/core';
import { AssetBrowser } from './asset-browser/asset-browser';
import { AssetCatalogService } from './assets/asset-catalog.service';
import { ResolvedAssetDefinition } from './assets/asset.types';
import { EditorToolbar } from './editor-toolbar/editor-toolbar';
import { EditorState, INITIAL_EDITOR_STATE } from './game/editor/editor.types';
import {
  createInitialEnvironmentState,
  environmentPhaseLabel,
  EnvironmentState,
  formatTimeOfDay,
  TIME_SCALES,
} from './game/engine/environment.types';
import { GameViewport } from './game/viewport/game-viewport';
import { decodeWorldSave } from './game/save/save-codec';
import { loadLocalWorldSave, saveLocalWorldSave } from './game/save/save-storage';
import { SaveLoadWarning, WorldSaveV3 } from './game/save/save.types';
import { WORLD_CONFIG } from './game/world/world.config';
import {
  DEFAULT_VEGETATION_QUALITY,
  VEGETATION_QUALITIES,
  VegetationQuality,
  loadVegetationQuality,
  saveVegetationQuality,
} from './game/vegetation/vegetation-quality';

@Component({
  selector: 'app-root',
  imports: [AssetBrowser, EditorToolbar, GameViewport],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly catalog = inject(AssetCatalogService);
  protected readonly editorState = signal<EditorState>(INITIAL_EDITOR_STATE);
  protected readonly environmentState = signal<EnvironmentState>(createInitialEnvironmentState());
  protected readonly timeScales = TIME_SCALES;
  protected readonly environmentPanelOpen = signal(false);
  protected readonly vegetationQualities = VEGETATION_QUALITIES;
  protected readonly vegetationQuality = signal<VegetationQuality>(this.initialQuality());
  protected readonly worldWidthKilometres = WORLD_CONFIG.width / 1_000;
  protected readonly worldDepthKilometres = WORLD_CONFIG.depth / 1_000;
  protected readonly savePanelOpen = signal(false);
  protected readonly saveStatus = signal<SaveStatus>('unavailable');
  protected readonly saveMessage = signal('');
  protected readonly hasLocalSave = signal(false);

  private pendingLocalSave: WorldSaveV3 | undefined;
  private assetMapPromise: Promise<ReadonlyMap<string, ResolvedAssetDefinition>> | undefined;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private worldReady = false;
  private worldDirty = false;

  constructor() {
    this.readInitialLocalSave();
  }

  protected setVegetationQuality(value: string, world: GameViewport): void {
    if (!VEGETATION_QUALITIES.includes(value as VegetationQuality)) return;
    const quality = value as VegetationQuality;
    this.vegetationQuality.set(quality);
    world.setVegetationQuality(quality);
    try {
      saveVegetationQuality(localStorage, quality);
    } catch {
      // Storage may be unavailable in privacy modes; the active session still updates.
    }
  }

  protected async worldReadyForSaves(world: GameViewport): Promise<void> {
    this.worldReady = true;
    const save = this.pendingLocalSave;
    if (!save) return;
    this.saveStatus.set('loading');
    this.saveMessage.set('Restoring local save…');
    try {
      const warning = await world.loadSave(save, await this.loadAssets());
      this.worldDirty = false;
      this.setSaveSuccess(warning);
    } catch (error) {
      this.setSaveError(error, 'The local save could not be restored.');
    }
  }

  protected scheduleAutoSave(world: GameViewport): void {
    this.worldDirty = true;
    this.saveStatus.set('unsaved');
    this.saveMessage.set('Unsaved changes');
    if (!this.worldReady) return;
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = undefined;
      void this.saveLocal(world);
    }, 750);
  }

  protected async saveNow(world: GameViewport): Promise<void> {
    await this.saveLocal(world);
  }

  protected async resetWorld(world: GameViewport): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Reset the current world? This cannot be undone.')
    ) {
      return;
    }

    this.clearAutosaveTimer();
    this.saveStatus.set('loading');
    this.saveMessage.set('Resetting world…');
    try {
      await world.resetWorld();
      this.worldDirty = false;
      await this.saveLocal(world);
      if (this.saveStatus() === 'error') this.worldDirty = true;
    } catch (error) {
      this.setSaveError(error, 'The world could not be reset.');
    }
  }

  protected async loadLocal(world: GameViewport): Promise<void> {
    let save: WorldSaveV3 | undefined;
    try {
      save = this.readLocalSave();
    } catch (error) {
      this.setSaveError(error, 'The local save is invalid.');
      return;
    }
    if (!save) {
      this.saveStatus.set('unavailable');
      this.saveMessage.set('No local save found');
      return;
    }
    await this.applySave(save, world, 'local save');
  }

  protected exportSave(world: GameViewport): void {
    const save = world.createSave();
    if (!save) {
      this.setSaveError(new Error('The world is not ready.'), 'The save could not be exported.');
      return;
    }
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quiescent-chevrotain-${this.fileTimestamp(save)}.qcsave`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.saveStatus.set('saved');
    this.saveMessage.set('Save exported');
  }

  protected async importSave(event: Event, world: GameViewport): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.saveStatus.set('loading');
    this.saveMessage.set('Reading save file…');
    try {
      const save = decodeWorldSave(await file.text());
      await this.applySave(save, world, 'imported save');
    } catch (error) {
      this.setSaveError(error, 'The save file could not be imported.');
    }
  }

  protected saveStatusLabel(): string {
    switch (this.saveStatus()) {
      case 'loading':
        return 'Loading';
      case 'saving':
        return 'Saving';
      case 'saved':
        return 'Saved';
      case 'unsaved':
        return 'Unsaved';
      case 'error':
        return 'Save error';
      default:
        return 'No local save';
    }
  }

  private initialQuality(): VegetationQuality {
    try {
      return loadVegetationQuality(localStorage);
    } catch {
      return DEFAULT_VEGETATION_QUALITY;
    }
  }

  private readInitialLocalSave(): void {
    try {
      const save = this.readLocalSave();
      if (!save) {
        this.saveStatus.set('unavailable');
        this.saveMessage.set('No local save found');
        return;
      }
      this.pendingLocalSave = save;
      this.hasLocalSave.set(true);
      this.saveStatus.set('loading');
      this.saveMessage.set('Local save ready');
    } catch (error) {
      this.setSaveError(error, 'The local save is invalid.');
    }
  }

  private readLocalSave(): WorldSaveV3 | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    return loadLocalWorldSave(localStorage);
  }

  private async saveLocal(world: GameViewport): Promise<void> {
    this.clearAutosaveTimer();
    const save = world.createSave();
    if (!save || typeof localStorage === 'undefined') {
      this.setSaveError(new Error('Local storage is unavailable.'), 'Local saving is unavailable.');
      return;
    }
    this.saveStatus.set('saving');
    this.saveMessage.set('Saving locally…');
    try {
      saveLocalWorldSave(localStorage, save);
      this.pendingLocalSave = save;
      this.hasLocalSave.set(true);
      this.worldDirty = false;
      this.setSaveSuccess();
    } catch (error) {
      this.setSaveError(error, 'The local save could not be written. Export a save file instead.');
    }
  }

  private async applySave(save: WorldSaveV3, world: GameViewport, label: string): Promise<void> {
    if (
      this.worldDirty &&
      typeof window !== 'undefined' &&
      !window.confirm(`Replace the current world with this ${label}?`)
    ) {
      this.saveStatus.set('unsaved');
      this.saveMessage.set('Import cancelled');
      return;
    }

    this.saveStatus.set('loading');
    this.saveMessage.set('Loading save…');
    this.clearAutosaveTimer();
    try {
      const warning = await world.loadSave(save, await this.loadAssets());
      this.worldDirty = false;
      if (label === 'imported save') await this.saveLocal(world);
      else this.setSaveSuccess(warning);
      if (warning && this.saveStatus() !== 'error') this.saveMessage.set(warning.message);
    } catch (error) {
      this.setSaveError(error, `The ${label} could not be loaded.`);
    }
  }

  private async loadAssets(): Promise<ReadonlyMap<string, ResolvedAssetDefinition>> {
    if (!this.assetMapPromise) {
      this.assetMapPromise = this.catalog
        .load()
        .then((assets) => new Map(assets.map((asset) => [asset.id, asset])));
    }
    return this.assetMapPromise;
  }

  private setSaveSuccess(warning?: SaveLoadWarning): void {
    this.saveStatus.set('saved');
    this.saveMessage.set(warning?.message ?? 'Saved locally');
  }

  private setSaveError(error: unknown, fallback: string): void {
    this.saveStatus.set('error');
    this.saveMessage.set(error instanceof Error ? error.message : fallback);
  }

  protected timeLabel(): string {
    return formatTimeOfDay(this.environmentState().timeOfDayMinutes);
  }

  protected phaseLabel(): string {
    return environmentPhaseLabel(this.environmentState().phase);
  }

  protected setTimeOfDay(value: string, world: GameViewport): void {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    world.setTimeOfDay(minutes);
  }

  protected toggleTimePaused(world: GameViewport): void {
    world.setTimePaused(!this.environmentState().paused);
  }

  protected setTimeScale(value: number, world: GameViewport): void {
    world.setTimeScale(value);
  }

  private fileTimestamp(save: WorldSaveV3): string {
    const date = new Date(save.savedAt);
    if (Number.isNaN(date.getTime())) return 'save';
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  private clearAutosaveTimer(): void {
    if (this.autosaveTimer === undefined) return;
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
  }
}

type SaveStatus = 'unavailable' | 'loading' | 'saving' | 'saved' | 'unsaved' | 'error';
