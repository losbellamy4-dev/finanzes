/**
 * Criterios de aceptación ejecutados en un navegador real (sección 22).
 * Cada proyecto (escritorio/móvil) arranca con un IndexedDB vacío.
 */
import { expect, test, type Page } from '@playwright/test';

/** Importe exacto en formato es-ES (p. ej. "1.000,00 €"). */
const eur = (s: string) => new RegExp(`^${s.replace(/\./g, '\\.')}\\s€$`);
/** Importe contenido en un texto mayor. */
const money = (s: string) => new RegExp(`${s.replace(/\./g, '\\.')}\\s€`);

async function createEmptyProfile(page: Page, name: string, owner: string) {
  await page.getByLabel('Nombre del perfil').fill(name);
  await page.getByLabel('Titular (ficticio)').fill(owner);
  await page.getByText('Desde cero', { exact: true }).click();
  await page.getByRole('button', { name: 'Crear perfil' }).click();
}

async function openAccount(page: Page, name: string, initial?: string) {
  await page.goto('/#/accounts');
  await page.getByRole('button', { name: /Nueva cuenta|Abrir mi primera cuenta/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la cuenta').fill(name);
  if (initial) await dialog.getByLabel('Saldo inicial (opcional)').fill(initial);
  await dialog.getByRole('button', { name: 'Abrir cuenta' }).click();
  await expect(page.getByTestId('account-balance')).toBeVisible();
}

async function goToAccount(page: Page, name: string) {
  await page.goto('/#/accounts');
  await page.getByRole('link', { name }).first().click();
  await expect(page.getByTestId('account-balance')).toBeVisible();
}

async function moneyOperation(page: Page, action: string, amount: string, extra?: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) {
  await page.getByRole('button', { name: action, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe').fill(amount);
  if (extra) await extra(dialog);
  await dialog.getByRole('button', { name: action === 'Traspasar' ? 'Transferir' : action === 'Pagar' ? 'Pagar' : action, exact: true }).click();
}

test('TEST 1–9: banca, inversión, persistencia, perfiles y saldo insuficiente', async ({ page }) => {
  await page.goto('/');
  await createEmptyProfile(page, 'Perfil A', 'Ana Prueba');
  await expect(page.getByTestId('net-worth')).toBeVisible();

  // TEST 1: crear una cuenta con 1.000 €
  await openAccount(page, 'Principal', '1000');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('1.000,00'));

  // TEST 2: ingresar 500 € → 1.500 €
  await moneyOperation(page, 'Ingresar', '500');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('1.500,00'));

  // TEST 3: gastar 200 € → 1.300 €
  await moneyOperation(page, 'Pagar', '200', async (d) => {
    await d.getByLabel('Comercio o beneficiario').fill('Supermercado');
  });
  await expect(page.getByTestId('account-balance')).toHaveText(eur('1.300,00'));

  // TEST 4: transferir 300 € a otra cuenta → origen 1.000 €, destino 300 €
  await openAccount(page, 'Ahorro');
  await goToAccount(page, 'Principal');
  await moneyOperation(page, 'Traspasar', '300');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('1.000,00'));
  await goToAccount(page, 'Ahorro');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('300,00'));

  // TEST 9: gastar más de lo disponible → rechazado sin alterar balances
  await page.getByRole('button', { name: 'Pagar', exact: true }).first().click();
  const payDialog = page.getByRole('dialog');
  await payDialog.getByLabel('Comercio o beneficiario').fill('Joyería');
  await payDialog.getByLabel('Importe').fill('400');
  await payDialog.getByRole('button', { name: 'Pagar', exact: true }).click();
  await expect(payDialog.getByRole('alert')).toContainText('Saldo insuficiente');
  await payDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('account-balance')).toHaveText(eur('300,00'));

  // TEST 5: comprar activos por 200 € → saldo −200 € y posición de 200 €
  await page.goto('/#/invest/asset/ast_aurx');
  const trade = page.locator('section', { has: page.getByRole('heading', { name: 'Operar', exact: true }) });
  await expect(trade.getByLabel('Pagar desde')).toHaveValue(/acc_/);
  await trade.getByLabel('Importe').fill('200');
  await trade.getByRole('button', { name: 'Comprar AURX' }).click();
  const position = page.locator('section', { has: page.getByRole('heading', { name: 'Tu posición', exact: true }) });
  await expect(position).toBeVisible();
  await expect(position).toContainText(money('200,00'));
  await goToAccount(page, 'Principal');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('800,00'));

  // TEST 6: vender la posición → se elimina, se actualiza el saldo y se registra
  await page.goto('/#/invest/asset/ast_aurx');
  await trade.getByRole('tab', { name: 'Vender' }).click();
  await trade.getByRole('button', { name: 'Vender toda la posición' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Vender todo' }).click();
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Tu posición', exact: true }) })).toHaveCount(0);
  await page.goto('/#/invest/history');
  await expect(page.getByRole('cell', { name: 'Venta' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Compra' })).toBeVisible();
  await goToAccount(page, 'Principal');
  await expect(page.getByTestId('account-balance')).not.toHaveText(eur('800,00'));
  const balanceAfterSale = await page.getByTestId('account-balance').innerText();

  // TEST 7: cerrar y volver a abrir → los datos continúan guardados
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('account-balance')).toHaveText(balanceAfterSale);
  await goToAccount(page, 'Ahorro');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('300,00'));

  // TEST 8: cambiar de perfil → los datos permanecen independientes
  await page.goto('/#/profiles');
  await page.getByRole('button', { name: 'Nuevo perfil' }).click();
  await createEmptyProfile(page, 'Perfil B', 'Beto Prueba');
  await expect(page.getByTestId('net-worth')).toHaveText(eur('0,00'));
  await page.goto('/#/accounts');
  await expect(page.getByText('Aún no tienes cuentas')).toBeVisible();
  await page.goto('/#/profiles');
  const cardA = page.locator('section', { hasText: 'Perfil A' });
  await cardA.getByRole('button', { name: 'Usar' }).click();
  await goToAccount(page, 'Principal');
  await expect(page.getByTestId('account-balance')).toHaveText(balanceAfterSale);
  await goToAccount(page, 'Ahorro');
  await expect(page.getByTestId('account-balance')).toHaveText(eur('300,00'));
});

test('Perfil de demostración: todas las secciones cargan sin errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Titular (ficticio)').fill('Demo');
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  const routes = [
    ['/accounts', 'Cuentas'],
    ['/operations', 'Operaciones'],
    ['/cards', 'Tarjetas'],
    ['/invest', 'Mercados'],
    ['/invest/portfolio', 'Cartera'],
    ['/invest/derivatives', 'Derivados simulados'],
    ['/invest/history', 'Historial de operaciones'],
    ['/market-control', 'Control de mercado'],
    ['/products', 'Productos financieros'],
    ['/products/savings', 'Ahorro'],
    ['/products/loans', 'Préstamos y créditos'],
    ['/products/insurance', 'Seguros'],
    ['/products/wealth', 'Patrimonio'],
    ['/realestate', 'Inmobiliario'],
    ['/credit', 'Credit Score'],
    ['/activity', 'Actividad'],
    ['/notifications', 'Notificaciones'],
    ['/profiles', 'Perfiles financieros'],
    ['/settings', 'Ajustes'],
  ];
  for (const [route, title] of routes) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
  // Avanzar un mes procesa el calendario financiero (cuotas, rentas, extractos...).
  await page.goto('/#/activity');
  const txBefore = await page.locator('.nx-card', { hasText: 'Movimientos totales' }).innerText();
  if ((page.viewportSize()?.width ?? 1200) < 768) await page.getByRole('button', { name: 'Controles de simulación' }).click();
  await page.locator('[title="Avanzar 1 mes"]:visible').first().click();
  await expect(page.locator('.nx-card', { hasText: 'Movimientos totales' })).not.toHaveText(txBefore, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
