<script setup lang="ts">
// The open kind has nothing: said plainly.
import { computed } from 'vue'
import { S } from '../state'
import { FROM_DECOMP, kindDef } from '../lib/nav'

const k = computed(() => kindDef(S.kind))
const noMap = computed(() => FROM_DECOMP[S.kind] && (!S.map || S.map.state === 'none' || S.map.state === 'missing'))
const old = computed(() => FROM_DECOMP[S.kind] && !!S.map && S.map.state === 'old')
const line = computed(() => (!FROM_DECOMP[S.kind] ? 'The disc contains no readable ' + k.value.label.toLowerCase() + '.' : 'The decomp repo contains no mapped ' + k.value.label.toLowerCase() + '.'))
</script>

<template>
  <div class="center">
    <div class="empty-kind">
      <h2>{{ old ? 'Upgrade the Decomp' : noMap ? 'No Decomp Chosen' : 'No ' + k.label + ' Found' }}</h2>
      <p v-if="old">This decomp was made with version {{ S.map!.version || 'unknown' }} of the decomp kickoff. Upgrade it with the skill to see its {{ k.label.toLowerCase() }}.</p>
      <p v-else>{{ noMap ? 'Without its decomp this game has no ' + k.label.toLowerCase() + ' to show.' : line }}</p>
    </div>
  </div>
</template>
