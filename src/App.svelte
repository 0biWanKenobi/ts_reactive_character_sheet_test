<script lang="ts">
  import FieldRow from './lib/FieldRow.svelte';
  import { validateId, type Sheet } from './lib/engine';

  const defaults: Sheet = {
    STR: { id: 'STR', formula: '16' },
    DEX: { id: 'DEX', formula: '12' },
    PROF: { id: 'PROF', formula: '2' },
    STR_MOD: { id: 'STR_MOD', formula: 'floor((STR - 10) / 2)' },
    ATTACK: { id: 'ATTACK', formula: 'STR_MOD + PROF' },
    BONUS_ATTACK: { id: 'BONUS_ATTACK', formula: 'ATTACK + 1' },
    DAMAGE: { id: 'DAMAGE', formula: '3d6 + STR_MOD' },
    DROP_LOWEST: { id: 'DROP_LOWEST', formula: 'dl(3d6, 1) + STR_MOD' },
    KEEP_HIGHEST: { id: 'KEEP_HIGHEST', formula: 'kh(4d8, 2) + PROF' },
    BOOLEAN: { id: 'BOOL_CHECK', formula: 'STR > 19'}
  };
  let sheet = $state<Sheet>(structuredClone(defaults));
  let newId = $state('');
  let newFormula = $state('1');
  let addError = $state('');
  let ids = $derived(Object.keys(sheet));

  function addField() {
    const id = newId.trim().toUpperCase();
    const invalid = validateId(id);
    if (invalid) { addError = invalid; return; }
    if (Object.hasOwn(sheet, id)) { addError = 'Field already exists'; return; }
    sheet[id] = { id, formula: newFormula };
    newId = '';
    newFormula = '1';
    addError = '';
  }
  function reset() { sheet = structuredClone(defaults); addError = ''; }
  function removeField(id: string) { delete sheet[id]; }
</script>

<svelte:head>
  <title>Reactive RPG Formula Sheet</title>
  <meta name="description" content="Svelte 5 reactive RPG sheet with math.js and dice" />
</svelte:head>

<main>
  <header>
    <div><div class="eyebrow">SVELTE 5 + MATH.JS</div><h1>Reactive RPG Sheet</h1>
      <p>Edit any formula. Nested references recalculate automatically; dice only roll on click.</p></div>
    <button class="secondary" onclick={reset}>Reset demo</button>
  </header>

  <section class="panel">
    <div class="sectionhead"><h2>Sheet values</h2><span>{ids.length} fields</span></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Field</th><th>Formula (editable)</th><th>Result</th><th>Resolved expression · dependencies</th><th></th></tr></thead>
      <tbody>{#each ids as id (id)}<FieldRow {id} {sheet} onRemove={removeField} />{/each}</tbody>
    </table></div>
  </section>

  <section class="panel new-field">
    <h2>Add a field</h2>
    <form onsubmit={(event) => { event.preventDefault(); addField(); }}>
      <label>Field ID <input placeholder="AC" bind:value={newId} /></label>
      <label>Formula <input placeholder="10 + DEX" bind:value={newFormula} /></label>
      <button type="submit">Add field</button>
    </form>
    {#if addError}<p class="error">{addError}</p>{/if}
  </section>

  <section class="panel notes"><h2>Try it</h2>
    <ul>
      <li>Change <code>STR</code> to <code>20</code>: <code>STR_MOD</code>, <code>ATTACK</code>, and <code>BONUS_ATTACK</code> update.</li>
      <li>Change <code>STR_MOD</code> to <code>ATTACK + 1</code>: circular-reference error.</li>
      <li>Change <code>ATTACK</code> to <code>UNKNOWN + 1</code>: unknown-reference error.</li>
      <li>Roll <code>DAMAGE</code>, change <code>STR</code>, then roll again. Stat changes never automatically reroll dice.</li>
      <li>Add <code>POWER</code> with <code>BONUS_ATTACK * 3</code>.</li>
    </ul>
    <p><strong>Supported:</strong> <code>+ - * / ^ %</code>, parentheses, <code>floor</code>, <code>ceil</code>, <code>round</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>sqrt</code>, <code>NdM</code>, <code>dl(NdM, K)</code> and <code>kh(NdM, K)</code>.</p>
    <p class="muted">Each row owns a separate <code>$derived.by()</code> computation. Parsed ASTs are cached by formula text, while recursive resolution memoizes repeated references within each calculation. The roll result is intentionally a separate snapshot from the live formula.</p>
  </section>
</main>