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

    expect(buttons).toHaveLength(8);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(true);
    expect(buttons[4].disabled).toBe(false);
    expect(buttons[6].disabled).toBe(true);
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

    buttons[6].click();
    buttons[7].click();

    expect(toolChange).toHaveBeenCalledWith('rotate');
    expect(deleteSelected).toHaveBeenCalledOnce();
  });
});
