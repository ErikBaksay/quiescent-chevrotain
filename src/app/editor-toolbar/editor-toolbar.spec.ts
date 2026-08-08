import { TestBed } from '@angular/core/testing';
import { EditorToolbar } from './editor-toolbar';
import { INITIAL_EDITOR_STATE } from '../game/editor/editor.types';

describe('EditorToolbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EditorToolbar] }).compileComponents();
  });

  it('disables transform actions until an object is selected', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
      ...INITIAL_EDITOR_STATE,
    });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;

    expect(buttons).toHaveLength(15);
    expect(fixture.nativeElement.querySelector('[aria-label="Select objects"]')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Paint terrain surfaces"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Raise terrain"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Undo terrain stroke"]')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Move selected object"]')?.disabled,
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Scale selected object"]')?.disabled,
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Duplicate selected object"]')?.disabled,
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Delete selected object"]')?.disabled,
    ).toBe(true);
  });

  it('emits tool and delete commands', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
      ...INITIAL_EDITOR_STATE,
      tool: 'move',
      hasSelection: true,
      objectCount: 1,
    });
    const toolChange = vi.fn();
    const deleteSelected = vi.fn();
    fixture.componentInstance.toolChange.subscribe(toolChange);
    fixture.componentInstance.deleteSelected.subscribe(deleteSelected);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;

    fixture.nativeElement.querySelector('[aria-label="Rotate selected object"]')?.click();
    fixture.nativeElement.querySelector('[aria-label="Delete selected object"]')?.click();

    expect(toolChange).toHaveBeenCalledWith('rotate');
    expect(deleteSelected).toHaveBeenCalledOnce();
  });

  it('emits sculpt tools and brush settings', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
      ...INITIAL_EDITOR_STATE,
      tool: 'sculpt',
    });
    const sculptToolChange = vi.fn();
    const brushChange = vi.fn();
    fixture.componentInstance.sculptToolChange.subscribe(sculptToolChange);
    fixture.componentInstance.brushChange.subscribe(brushChange);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[aria-label="Flatten terrain"]')?.click();
    const size = fixture.nativeElement.querySelector(
      '[aria-label="Brush size"]',
    ) as HTMLInputElement;
    size.value = '48';
    size.dispatchEvent(new Event('input'));

    expect(sculptToolChange).toHaveBeenCalledWith('flatten');
    expect(brushChange).toHaveBeenCalledWith({ ...INITIAL_EDITOR_STATE.brush, size: 48 });
  });

  it('emits surface selection and paint brush settings', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
      ...INITIAL_EDITOR_STATE,
      tool: 'paint',
    });
    const surfaceChange = vi.fn();
    const brushChange = vi.fn();
    fixture.componentInstance.surfaceChange.subscribe(surfaceChange);
    fixture.componentInstance.brushChange.subscribe(brushChange);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[aria-label="Asphalt"]')?.click();
    const size = fixture.nativeElement.querySelector(
      '[aria-label="Brush size"]',
    ) as HTMLInputElement;
    size.value = '64';
    size.dispatchEvent(new Event('input'));

    expect(surfaceChange).toHaveBeenCalledWith('asphalt');
    expect(brushChange).toHaveBeenCalledWith({ ...INITIAL_EDITOR_STATE.paintBrush, size: 64 });
  });
});
