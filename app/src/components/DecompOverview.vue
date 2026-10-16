<script setup lang="ts">
// The decomp at a glance: its progress block (from its README), the main figure first.
import { computed } from 'vue'
import { S } from '../state'
import { capitalise, facts, progressRows } from '../lib/progress'

const rows = computed(() => progressRows((S.map && S.map.readme) || ''))
const main = computed(() => rows.value.find((r) => r.pct !== null) || null)
</script>

<template>
  <div class="detail">
    <div class="head">
      <div>
        <div class="crumbs"><span>Decomp</span></div>
        <h1 class="cat-title">{{ S.map ? S.map.name : '' }}</h1>
      </div>
    </div>
    <div v-if="!rows.length" class="center"><div class="empty-kind"><h2>No Progress Yet</h2><p>This decomp's README has no progress report.</p></div></div>
    <template v-else>
      <section v-if="main" class="card prog-main"><div class="card-b">
        <div class="prog-big"><span class="prog-pct mono">{{ main.pct }}%</span><span class="prog-label">{{ capitalise(main.label) }}</span></div>
        <div class="prog-bar big" role="img" :aria-label="main.pct + '%'"><span :style="{ width: main.pct + '%' }"></span></div>
        <div class="prog-detail">{{ facts(main.detail) }}</div>
      </div></section>
      <section class="card"><div class="card-b prog-rows">
        <template v-for="(r, i) in rows" :key="i">
          <div v-if="r.heading" class="prog-heading">{{ capitalise(r.label) }}</div>
          <div v-else class="prog-row" :style="{ paddingLeft: (r.depth - 1) * 18 + 'px' }">
            <span class="prog-name">{{ capitalise(r.label) }}</span>
            <span class="prog-bar"><span v-if="r.pct !== null" :style="{ width: r.pct + '%' }"></span></span>
            <span class="prog-num mono">{{ r.pct !== null ? r.pct + '%' : '' }}</span>
            <span class="prog-detail">{{ facts(r.detail) }}</span>
          </div>
        </template>
      </div></section>
      <p class="prog-note">As of the decomp's last commit.</p>
    </template>
  </div>
</template>
