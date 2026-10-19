import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fakeFinishedView } from '@/lib/fake';
import { DisplayFinishedScene } from './DisplayScenes';
import { GameOverScreen } from './GameOverScreen';

/**
 * Kürsü (SPEC 4.5): olimpiyat düzeni — ortada 1. (en yüksek, vurgulu),
 * solda 2., sağda 3.; sütundaki rakam sıra numarasıyla aynı.
 */
describe('oyun sonu kürsüsü', () => {
  it('telefon: solda 2., ortada 1., sağda 3.; rakam sırayla uyumlu', () => {
    render(<GameOverScreen view={fakeFinishedView()} />);

    const podium = screen.getByRole('region', { name: 'Kürsü' });
    expect(
      within(podium)
        .getAllByText(/^(Ben|Ali|Ayşe|Mehmet|Zeynep|Can|Elif)$/)
        .map((el) => el.textContent),
    ).toEqual(['Ayşe', 'Ali', 'Mehmet']);
    expect(
      within(podium)
        .getAllByText(/^[123]$/)
        .map((el) => el.textContent),
    ).toEqual(['2', '1', '3']);

    // Vurgu 1.'in sütunundadır; 2. ve 3. nötr çerçevededir.
    expect(within(podium).getByText('1').closest('div')).toHaveClass('border-accent');
    expect(within(podium).getByText('2').closest('div')).not.toHaveClass('border-accent');
    expect(within(podium).getByText('3').closest('div')).not.toHaveClass('border-accent');
  });

  it('ortak ekran: aynı düzen ve rakamlar', () => {
    render(
      <DisplayFinishedScene
        view={fakeFinishedView()}
        room={{ code: 'KA7FT2', joinUrl: 'https://mol.gg/o/KA7FT2' }}
      />,
    );

    const podium = screen.getByRole('region', { name: 'Kürsü' });
    expect(
      within(podium)
        .getAllByText(/^(Ben|Ali|Ayşe|Mehmet|Zeynep|Can|Elif)$/)
        .map((el) => el.textContent),
    ).toEqual(['Ayşe', 'Ali', 'Mehmet']);
    expect(
      within(podium)
        .getAllByText(/^[123]$/)
        .map((el) => el.textContent),
    ).toEqual(['2', '1', '3']);
    expect(within(podium).getByText('1').closest('div')).toHaveClass('border-accent');
  });
});
