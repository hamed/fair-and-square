/**
 * The Rules drawer on the stage page, in Chromium: the editor's regressions from REVIEW-2026-10-19-MODEL-BLOCKS
 * (MB5 and its recheck R1, MB7; MB4's modes are gone), the self-review's S3, and the drawer itself (the yard plays the blocks).
 */
import { expect, test, type Page } from '@playwright/test';
import { canonical } from '../../model/ast.ts';
import { PRESETS, preset } from '../../model/presets.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'editor behaviour: one browser is enough');

/** The stage, straight in (no opening), with the Rules drawer open and its blocks loaded. */
async function open(page: Page): Promise<void> {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  await page.evaluate(() => (document.querySelector('#menu [data-go="rules"]') as HTMLElement).click());
  await page.waitForFunction(() => (window as any).fns.editor());
  await settle(page);
}

/** Wait past the drawer's settle time (150 ms) and Blockly's event dispatch. */
const settle = (page: Page) => page.waitForTimeout(500);

/** A program as text, keys sorted (model/ast.ts canonical): equal programs, equal texts, however written. */
const canonicalIn = `(p) => JSON.stringify(p, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)`;
const blocksProgram = (page: Page) => page.evaluate((c) => eval(c)((window as any).fns.editor().read().program), canonicalIn);
const yardProgram = (page: Page) => page.evaluate((c) => eval(c)((window as any).fns.session().game.program), canonicalIn);

test('the library shows only released and coming-soon models, with a follow link', async ({ page }) => {
  await open(page);
  const options = await page.locator('#rules select option').evaluateAll((os) =>
    os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent, disabled: (o as HTMLOptionElement).disabled })),
  );
  expect(options).toEqual([
    { value: '', text: 'Library…', disabled: false },
    { value: 'yard-sale', text: 'Yard sale', disabled: false },
    { value: 'wealth-tax', text: 'Wealth tax', disabled: false },
    { value: 'advantage', text: 'Advantage: the richer are stronger — coming soon', disabled: true },
    { value: 'merit', text: 'Merit — coming soon', disabled: true },
  ]);
  const note = page.locator('#rules .library-note');
  await expect(note).toHaveText('More models coming soon. Follow me for new releases →');
  await expect(note).toBeVisible();
  const follow = note.getByRole('link', { name: 'Follow me for new releases →' });
  await expect(follow).toHaveAttribute('href', './about.html#elsewhere');
  await expect(follow).toHaveAttribute('target', '_blank');
  await expect(follow).toHaveAttribute('rel', 'noopener');
  const popupPromise = page.waitForEvent('popup');
  await follow.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/about\.html#elsewhere$/);
  await expect(popup.locator('#elsewhere')).toBeInViewport();
  await popup.close();
});

test('coming-soon selections leave the blocks and yard unchanged', async ({ page }) => {
  await open(page);
  const before = await blocksProgram(page);
  const beforeYard = await yardProgram(page);
  for (const id of ['advantage', 'merit']) {
    await page.locator('#rules select').evaluate((el: HTMLSelectElement, id) => {
      el.value = id;
      el.dispatchEvent(new Event('change'));
    }, id);
    await settle(page);
    expect(await blocksProgram(page)).toBe(before);
    expect(await yardProgram(page)).toBe(beforeYard);
    await expect(page.locator('#rules select')).toHaveValue('');
  }
});

test('both released models load from the library into the blocks and yard', async ({ page }) => {
  await open(page);
  for (const id of ['wealth-tax', 'yard-sale']) {
    await page.selectOption('#rules select', id);
    await settle(page);
    expect(await blocksProgram(page)).toBe(canonical(preset(id).program));
    expect(await yardProgram(page)).toBe(canonical(preset(id).program));
    await expect(page.locator('#rules select')).toHaveValue('');
  }
});

test('compact power and group fraction keep their connections through mode changes and undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page);
  await page.evaluate(() => {
    const ws = (window as any).fns.editor().workspace;
    const power = ws.newBlock('op.fn2');
    power.initSvg();
    for (const [name, value] of [['a', 2], ['b', 3]]) {
      const literal = ws.newBlock('num');
      literal.setFieldValue(value, 'v');
      literal.initSvg();
      literal.render();
      power.getInput(name).connection.connect(literal.outputConnection);
    }
    power.render();
    const stat = ws.newBlock('stat.of');
    stat.setFieldValue('talent', 'prop');
    stat.initSvg();
    const group = ws.newBlock('group.all');
    group.initSvg();
    group.render();
    stat.getInput('over').connection.connect(group.outputConnection);
    stat.render();
    (window as any).sentenceBlocks = { power, stat, a: power.getInputTargetBlock('a').id, b: power.getInputTargetBlock('b').id, group: group.id };
  });
  await settle(page);
  const state = () => page.evaluate(() => {
    const { power, stat, a, b, group } = (window as any).sentenceBlocks;
    return {
      fn: power.getFieldValue('fn'),
      order: power.inputList.map((i: { name: string }) => i.name),
      operandsKept: power.getInputTargetBlock('a').id === a && power.getInputTargetBlock('b').id === b,
      stat: stat.getFieldValue('stat'),
      prop: stat.getFieldValue('prop'),
      propVisible: stat.getField('prop').isVisible(),
      inVisible: stat.getField('IN').isVisible(),
      groupKept: stat.getInputTargetBlock('over').id === group,
    };
  });
  await page.evaluate(() => (window as any).fns.editor().workspace.clearUndo());
  await page.evaluate(() => (window as any).sentenceBlocks.power.setFieldValue('power', 'fn'));
  await settle(page);
  expect(await state()).toMatchObject({ fn: 'power', order: ['a', 'function', 'b'], operandsKept: true });
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(false));
  await settle(page);
  expect(await state()).toMatchObject({ fn: 'min', order: ['function', 'a', 'b'], operandsKept: true });
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(true));
  await settle(page);
  expect(await state()).toMatchObject({ fn: 'power', order: ['a', 'function', 'b'], operandsKept: true });
  await page.evaluate(() => (window as any).fns.editor().workspace.clearUndo());
  await page.evaluate(() => (window as any).sentenceBlocks.stat.setFieldValue('fraction', 'stat'));
  await settle(page);
  expect(await state()).toMatchObject({ stat: 'fraction', prop: 'talent', propVisible: false, inVisible: true, groupKept: true });
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(false));
  await settle(page);
  expect(await state()).toMatchObject({ stat: 'gini', prop: 'talent', propVisible: true, inVisible: false, groupKept: true });
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(true));
  await settle(page);
  expect(await state()).toMatchObject({ stat: 'fraction', prop: 'talent', propVisible: false, inVisible: true, groupKept: true });
  expect(errors).toEqual([]);
});

test('the yard plays the blocks: a library model goes to the yard, an invalid edit does not', async ({ page }) => {
  await open(page);
  expect(await blocksProgram(page)).toBe(await yardProgram(page));
  await page.selectOption('#rules select', 'wealth-tax');
  await settle(page);
  expect(await yardProgram(page)).toContain('"op":"take.wealth"');
  expect(await page.evaluate(() => (window as any).fns.session().game.n)).toBe(100);
  // a reporter that reads "winner" in the tax: greyed, and the yard keeps the last good program
  const before = await yardProgram(page);
  await page.evaluate(() => {
    const ws = (window as any).fns.editor().workspace;
    const tax = ws.getAllBlocks(false).find((b: { type: string }) => b.type === 'tax.take');
    const prop = ws.newBlock('val.prop');
    prop.setFieldValue('winner', 'who');
    prop.initSvg();
    prop.render();
    tax.getInput('tau').connection.connect(prop.outputConnection);
  });
  await settle(page);
  expect(await yardProgram(page)).toBe(before);
  await expect(page.locator('#rules .status')).toContainText('to fix');
});

test('MB5 and R1: a load the blocks reject changes neither the workspace nor its undo history', async ({ page }) => {
  await open(page);
  await page.evaluate((program) => (window as any).fns.editor().load(program), preset('saving').program);
  await settle(page);
  const state = () =>
    page.evaluate(() => {
      const editor = (window as any).fns.editor();
      return { program: JSON.stringify(editor.read().program), undo: editor.workspace.getUndoStack().length, tops: editor.workspace.getTopBlocks(false).length };
    });
  const before = await state();
  for (const bad of ['unknown', 'misplaced']) {
    const error = await page.evaluate((bad) => {
      const editor = (window as any).fns.editor();
      const program = editor.read().program;
      if (bad === 'unknown') program.scripts[0].body[2].body[0].op = 'trad';
      else program.scripts[0].body[2].body[0] = { op: 'num', v: 1 }; // a known op where a statement goes
      try {
        editor.load(program);
        return '';
      } catch (e) {
        return String(e);
      }
    }, bad);
    expect(error, bad).not.toBe('');
    await settle(page);
    expect(await state(), bad).toEqual(before);
  }
  // undo takes back the Saving load, redo brings it back: one script each time
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(false));
  await settle(page);
  expect((await state()).tops).toBe(1);
  expect((await state()).program).not.toBe(before.program);
  await page.evaluate(() => (window as any).fns.editor().workspace.undo(true));
  await settle(page);
  expect(await state()).toMatchObject({ program: before.program, tops: 1 });
});

test('MB7: the same invalid program loaded twice keeps its diagnostics on the new blocks', async ({ page }) => {
  await open(page);
  const greyed = () =>
    page.evaluate(() =>
      (window as any).fns
        .editor()
        .workspace.getAllBlocks(false)
        .filter((b: { isEnabled(): boolean; getIcon(t: string): unknown }) => !b.isEnabled() && b.getIcon('warning'))
        .map((b: { type: string }) => b.type),
    );
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => {
      const editor = (window as any).fns.editor();
      const program = editor.read().program;
      program.scripts[0].body[1].body[0].body[1].args.coin = { op: 'val.prop', f: { prop: 'wealth', who: 'me' } };
      editor.load(program);
    });
    await settle(page);
    expect(await greyed()).toEqual(['val.prop']);
  }
});

test('S3: a warning raised during setup shows on its block before any step', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const editor = (window as any).fns.editor();
    const program = editor.read().program;
    program.scripts[0].body[0].args.n = { op: 'num', v: 5000 };
    editor.load(program);
  });
  await settle(page);
  await page.waitForTimeout(300);
  const warned = await page.evaluate(() =>
    (window as any).fns
      .editor()
      .workspace.getAllBlocks(false)
      .filter((b: { getIcon(t: string): unknown }) => b.getIcon('warning'))
      .map((b: { type: string }) => b.type),
  );
  expect(warned).toEqual(['num']);
});

test('every preset still loads directly without a page error (two-dropdown shadows, Blockly 13.3)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page);
  for (const p of PRESETS) {
    await page.evaluate((program) => (window as any).fns.editor().load(program), p.program);
    await page.waitForTimeout(200);
    expect(await blocksProgram(page), p.id).toBe(canonical(p.program));
  }
  await settle(page);
  expect(errors).toEqual([]);
  expect(await yardProgram(page)).toContain('"op":"take.gains"');
});

test('the panel: the stage program\'s sliders move the run on the fly', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  await expect(page.locator('#panel .slider[data-slider]')).toHaveCount(2);
  await page.evaluate(() => (window as any).fns.run('fx off; round 5'));
  await page.locator('#panel .slider[data-slider="stake"] input').evaluate((el: HTMLInputElement) => {
    el.value = '0.5';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  const after = await page.evaluate(() => {
    const game = (window as any).fns.session().game;
    return { beta: game.rules.beta, round: game.run.round, inputs: game.run.inputs.length };
  });
  expect(after).toEqual({ beta: 0.5, round: 5, inputs: 1 });
});

test('the panel\'s run controls: step plays one round, restart goes back to round 0, play toggles', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  await page.evaluate(() => (window as any).fns.run('fx off; pause'));
  const round = () => page.evaluate(() => (window as any).fns.session().game.run.round);
  const r0 = await round();
  await page.locator('#panel [data-control="step"]').click();
  expect(await round()).toBe(r0 + 1);
  await page.locator('#panel [data-control="restart"]').click();
  expect(await round()).toBe(0);
  await page.locator('#panel [data-control="play"]').click();
  // an icon now (owner, 2026-10-22): its name says what it does
  await expect(page.locator('#panel [data-control="play"]')).toHaveAttribute('aria-label', 'Pause');
  expect(await page.evaluate(() => (window as any).fns.session().playing)).toBe(true);
});

/**
 * REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-2, N1: a slider resends its value after the run changed it underneath.
 * (Since REVIEW-2026-10-21-FULL-RECHECK-3 Restart keeps the reader's settings: the run is moved by a command here.)
 */
test('N1: after the run changed a slider underneath, it can be set to the value it had before; Restart keeps it', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  await page.evaluate(() => (window as any).fns.run('fx off; pause'));
  const slide = (value: string) =>
    page.locator('#panel .slider[data-slider="stake"] input').evaluate((el: HTMLInputElement, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    }, value);
  const beta = () => page.evaluate(() => (window as any).fns.session().game.rules.beta);
  await slide('0.5');
  expect(await beta()).toBe(0.5);
  // Start again: the same dice, the reader's settings
  await page.locator('#panel [data-control="restart"]').click();
  expect(await beta()).toBe(0.5);
  // moved underneath (the panel still shows 0.5 until it refreshes), then set back by the reader
  await page.evaluate(() => (window as any).fns.run('rule beta 0.1'));
  expect(await beta()).toBe(0.1);
  await slide('0.5');
  expect(await beta()).toBe(0.5);
});

/** N10: a library pick made while the blocks are still loading is kept. */
for (const id of ['yard-sale', 'wealth-tax']) {
  test(`N10: ${id} chosen while the blocks load is the one loaded`, async ({ page }) => {
    await page.route('**/blocks/editor.ts**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/?opening=0');
    await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
    await page.evaluate(() => (document.querySelector('#menu [data-go="rules"]') as HTMLElement).click());
    await expect(page.locator('#rules .status')).toContainText('loading');
    await page.selectOption('#rules select', id);
    await page.waitForFunction(() => (window as any).fns.editor());
    await settle(page);
    expect(await yardProgram(page)).toBe(canonical(preset(id).program));
    expect(await blocksProgram(page)).toBe(await yardProgram(page));
  });
}

/** N11: opening Rules on a shared custom model, without an edit, keeps the run where it is. */
test('N11: opening Rules does not restart a shared model', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  // a program written with args before f, as a hand-made share might be
  const program = {
    ast: 1,
    scripts: [
      {
        op: 'ctl.start',
        body: [
          { op: 'setup.yard', f: { space: 'free' }, args: { n: { op: 'num', v: 30 } } },
          {
            op: 'ctl.forever',
            body: [
              {
                op: 'trade',
                body: [
                  { op: 'trade.pair', args: { pair: { op: 'pair.match', args: { within: { op: 'group.all' } } } } },
                  { op: 'trade.flip', args: { coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } } } },
                  { op: 'trade.pay', args: { stake: { args: { beta: { op: 'pct', v: 0.1 } }, op: 'stake.share', f: { of: 'poorer' } } } },
                ],
              },
              { op: 'tax', body: [{ op: 'tax.take', args: { tau: { args: { rate: { op: 'pct', v: 0.01 }, from: { op: 'group.all' } }, op: 'take.wealth' } } }, { op: 'tax.give', args: { r: { args: { to: { op: 'group.all' } }, op: 'give.to', f: { how: 'equally' } } } }] },
            ],
          },
        ],
      },
    ],
  };
  const link = await page.evaluate((p) => {
    const fns = (window as any).fns;
    fns.run(`program ${JSON.stringify(p)}`);
    fns.run('fx off; round 5; levy 0.1');
    return fns.run('share');
  }, program);
  await page.goto(`/?opening=0${link}`);
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  const state = () => page.evaluate(() => ({ round: (window as any).fns.session().game.run.round, hash: (window as any).fns.session().game.run.hash() }));
  const before = await state();
  expect(before.round).toBe(5);
  await page.evaluate(() => (document.querySelector('#menu [data-go="rules"]') as HTMLElement).click());
  await page.waitForFunction(() => (window as any).fns.editor());
  await settle(page);
  expect(await state()).toEqual(before);
});

/** Recheck 3, N11: an untouched percentage that does not show exactly (1/3) does not restart a shared run either. */
test('N11b: opening Rules keeps a shared run whose stake is 1/3', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  const link = await page.evaluate(() => {
    const fns = (window as any).fns;
    const p = structuredClone(fns.session().game.program);
    const pay = p.scripts[0].body[1].body[0].body[2];
    pay.args.stake.args.beta = { op: 'pct', v: 1 / 3 };
    fns.run(`program ${JSON.stringify(p)}`);
    fns.run('fx off; round 5');
    fns.session().slide('tax', 0.05);
    return fns.run('share');
  });
  await page.goto(`/?opening=0${link}`);
  await page.waitForFunction(() => (window as unknown as { fns?: unknown }).fns);
  const state = () =>
    page.evaluate(() => {
      const game = (window as any).fns.session().game;
      return { round: game.run.round, steps: game.run.steps, inputs: game.run.inputs.length, beta: game.program.scripts[0].body[1].body[0].body[2].args.stake.args.beta.v };
    });
  const before = await state();
  expect(before).toEqual({ round: 5, steps: 6, inputs: 1, beta: 1 / 3 });
  await page.evaluate(() => (document.querySelector('#menu [data-go="rules"]') as HTMLElement).click());
  await page.waitForFunction(() => (window as any).fns.editor());
  await settle(page);
  expect(await state()).toEqual(before);
});
