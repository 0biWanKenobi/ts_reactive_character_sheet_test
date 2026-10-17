<script lang="ts">
  import { resolve, executeRoll, type RollOutcome, type Sheet } from './engine';
  let { id, sheet, onRemove }: { id: string; sheet: Sheet; onRemove: (id: string) => void } = $props();
  let result = $derived.by(() => {
    try { return { data: resolve(sheet, id), error: '' }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
  });
  let lastRoll = $state<RollOutcome | null>(null);
  let rollError = $state('');
  function roll() {
    if (!result.data) return;
    try { lastRoll = executeRoll(result.data.expression); rollError = ''; }
    catch (error) { rollError = error instanceof Error ? error.message : String(error); }
  }
</script>

<tr>
  <th scope="row"><code>{id}</code></th>
  <td><input aria-label={`Formula for ${id}`} spellcheck="false" bind:value={sheet[id].formula} /></td>
  <td>
    {#if result.error}<span class="error">{result.error}</span>
    {:else if result.data?.rollable}
      <button class="roll" onclick={roll}>🎲 Roll</button>
      {#if lastRoll !== null}
        <strong class="roll-value">{lastRoll.total}</strong>
        <small class="dice-detail">{#each lastRoll.dice as pool, index}{#if index > 0} · {/if}[{#each pool.rolls as value, i}{#if i > 0}, {/if}{#if pool.kept[i]}{value}{:else}<s>{value}</s>{/if}{/each}]{/each}</small>
      {/if}
    {:else}<strong>{result.data?.value}</strong>{/if}
    {#if rollError}<div class="error">{rollError}</div>{/if}
  </td>
  <td class="details">
    {#if result.data}
      <div title={result.data.expression}>{result.data.expression}</div>
      <small>Refs: {result.data.dependencies.join(', ') || 'none'}</small>
    {/if}
  </td>
  <td><button class="remove" onclick={() => onRemove(id)} title={`Delete ${id}`} aria-label={`Delete ${id}`}>×</button></td>
</tr>