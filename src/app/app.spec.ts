import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('creates the application shell', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the project identity, current stage, and editor tools', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.brand strong')?.textContent).toContain('Quiescent Chevrotain');
    expect(compiled.querySelector('.stage-card')?.textContent).toContain('Stage 3');
    expect(compiled.querySelector('[aria-label="World editor tools"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Asset catalogue"]')).toBeTruthy();
    expect(compiled.querySelector('canvas')?.getAttribute('aria-label')).toContain('3D world');
  });
});
