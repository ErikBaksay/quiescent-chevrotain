import { TestBed } from '@angular/core/testing';
import { EditorToolbar } from './editor-toolbar';

describe('EditorToolbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EditorToolbar] }).compileComponents();
  });

  it('disables transform actions until an object is selected', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
      tool: 'select',
      hasSelection: false,
      objectCount: 0,
    });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;

    expect(buttons).toHaveLength(5);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(true);
    expect(buttons[4].disabled).toBe(true);
  });

  it('emits tool and delete commands', () => {
    const fixture = TestBed.createComponent(EditorToolbar);
    fixture.componentRef.setInput('state', {
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

    buttons[3].click();
    buttons[4].click();

    expect(toolChange).toHaveBeenCalledWith('rotate');
    expect(deleteSelected).toHaveBeenCalledOnce();
  });
});
