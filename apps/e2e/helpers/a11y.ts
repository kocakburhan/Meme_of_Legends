import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * WCAG 2.1 A/AA taraması. İstisna yok: ihlal varsa test, hedef ve kural
 * kimliğiyle birlikte anlaşılır biçimde düşer.
 */
export async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  // Geçiş animasyonları ve ağdan gelen son boyamalar otursun.
  await page.waitForTimeout(100);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => `  - ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
        .join('\n');
      return `${violation.id} (${violation.impact ?? 'n/a'}) — ${violation.help}\n${targets}`;
    })
    .join('\n\n');
  expect(results.violations, `${label} erişilebilirlik ihlalleri:\n${summary}`).toEqual([]);

  // Tek h1 ve mantıklı başlık sırası (SPEC 18).
  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter((heading) => {
        const style = getComputedStyle(heading);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((heading) => Number(heading.tagName.slice(1))),
  );
  expect(headings.filter((level) => level === 1), `${label}: sayfada tek h1 olmalı`).toHaveLength(1);
  expect(headings[0], `${label}: sayfa h1 ile başlamalı`).toBe(1);
  for (let index = 1; index < headings.length; index++) {
    expect(
      headings[index]!,
      `${label}: başlık sırası atlamamalı (${headings.join(' → ')})`,
    ).toBeLessThanOrEqual(headings[index - 1]! + 1);
  }
}

/** Yatay taşma yok: %200 metin büyütmede 390 px görünümde de geçerli olmalı (SPEC 18). */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: yatay taşma (${overflow.scrollWidth}px > ${overflow.innerWidth}px)`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

/** Kök yazı boyutunu %200'e çıkarır (metin büyütme simülasyonu). */
export async function setTextZoom(page: Page, percent = 200): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = `${value}%`;
  }, percent);
}

/** Yeniden yüklemeden sonra kök yazı boyutunu temizler. */
export async function resetTextZoom(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

/**
 * Görünür etkileşim hedefleri en az 44×44 px olmalı (SPEC 18). Katılımcı ve
 * konsol yüzeylerinde çağrılır; ekran okuyucuya özel (.sr-only) öğeler ve
 * devre dışı kontroller atlanır.
 */
export async function expectTouchTargets(page: Page, label: string): Promise<void> {
  const tooSmall = await page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="radio"], [role="tab"]';
    const issues: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.closest('.sr-only') || element.classList.contains('sr-only')) continue;
      if (element.getAttribute('aria-hidden') === 'true') continue;
      if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.width < 44 || rect.height < 44) {
        const text = (element.getAttribute('aria-label') ?? element.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 60);
        issues.push(`${element.tagName.toLowerCase()} "${text}" ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      }
    }
    return issues;
  });
  expect(tooSmall, `${label}: 44×44 px'den küçük dokunma hedefleri:\n${tooSmall.join('\n')}`).toEqual(
    [],
  );
}
