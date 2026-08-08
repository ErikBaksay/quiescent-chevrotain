import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { AssetCatalogService } from '../assets/asset-catalog.service';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  AssetPlacementSelection,
  ResolvedAssetDefinition,
  isVegetationAsset,
} from '../assets/asset.types';

type BrowserStatus = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-asset-browser',
  templateUrl: './asset-browser.html',
  styleUrl: './asset-browser.scss',
})
export class AssetBrowser implements OnInit {
  readonly assetSelected = output<AssetPlacementSelection>();
  readonly activeAssetId = signal<string | null>(null);

  private readonly catalog = inject(AssetCatalogService);
  protected readonly categories = ASSET_CATEGORIES;
  protected readonly status = signal<BrowserStatus>('loading');
  protected readonly assets = signal<readonly ResolvedAssetDefinition[]>([]);
  protected readonly selectedAsset = signal<ResolvedAssetDefinition | null>(null);
  protected readonly selectedShapeId = signal('default');
  protected readonly selectedPaletteId = signal('default');
  protected readonly category = signal<AssetCategory | 'all'>('all');
  protected readonly error = signal('');
  protected readonly visibleAssets = computed(() => {
    const category = this.category();
    return category === 'all'
      ? this.assets()
      : this.assets().filter((asset) => asset.category === category);
  });

  async ngOnInit(): Promise<void> {
    try {
      this.assets.set(await this.catalog.load());
      this.status.set('ready');
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'The asset catalogue could not be loaded.',
      );
      this.status.set('error');
    }
  }

  protected select(asset: ResolvedAssetDefinition): void {
    this.activeAssetId.set(asset.id);
    this.selectedAsset.set(asset);
    const appearance = this.appearanceOf(asset);
    this.selectedShapeId.set(appearance?.defaultShapeId ?? 'default');
    this.selectedPaletteId.set(appearance?.defaultPaletteId ?? 'default');
    this.emitSelection();
  }

  protected setShape(shapeId: string): void {
    this.selectedShapeId.set(shapeId);
    this.emitSelection();
  }

  protected setPalette(paletteId: string): void {
    this.selectedPaletteId.set(paletteId);
    this.emitSelection();
  }

  private emitSelection(): void {
    const asset = this.selectedAsset();
    if (!asset) return;
    this.assetSelected.emit({
      asset,
      shapeId: this.selectedShapeId(),
      paletteId: this.selectedPaletteId(),
    });
  }

  protected appearanceOf(asset: ResolvedAssetDefinition) {
    return isVegetationAsset(asset) ? undefined : asset.appearance;
  }

  protected categoryLabel(category: AssetCategory): string {
    return category === 'street-furniture'
      ? 'Street'
      : `${category[0].toUpperCase()}${category.slice(1)}`;
  }
}
