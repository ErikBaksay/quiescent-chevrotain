import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { VEGETATION_QUALITY_STORAGE_KEY } from './game/vegetation/vegetation-quality';

describe('App', () => {
  beforeEach(async () => {
    localStorage.removeItem(VEGETATION_QUALITY_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(VEGETATION_QUALITY_STORAGE_KEY);
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
    expect(compiled.querySelector('[aria-label="World saves"]')).toBeFalsy();
    expect(compiled.querySelector('.save-control__button')?.textContent).toContain('Saves');
    expect(compiled.querySelector('[aria-label="World editor tools"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Asset catalogue"]')).toBeTruthy();
    expect(compiled.querySelector('canvas')?.getAttribute('aria-label')).toContain('3D world');
  });

  it('exposes reset world inside the Saves menu', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.save-control__button')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.save-panel__reset')?.textContent).toContain(
      'Reset world',
    );
  });

  it('selects Ultra when no quality has been persisted', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const quality = fixture.nativeElement.querySelector(
      '[aria-label="Vegetation quality"]',
    ) as HTMLSelectElement;

    expect(quality.value).toBe('ultra');
  });

  it('hydrates the selector from the persisted Ultra quality', () => {
    localStorage.setItem(VEGETATION_QUALITY_STORAGE_KEY, 'ultra');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const quality = fixture.nativeElement.querySelector(
      '[aria-label="Vegetation quality"]',
    ) as HTMLSelectElement;

    expect(quality.value).toBe('ultra');
  });
});
