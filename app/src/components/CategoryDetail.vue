<script setup lang="ts">
// A group or sub-group, opened from the breadcrumbs: its name and everything it holds, each one a link.
import { computed } from 'vue'
import { selectCategory, select } from '../state'
import { nameOf, type Item } from '../lib/dcgs'
import { kindDef } from '../lib/nav'

const props = defineProps<{ c: { key: string; group: string; sub?: string; items: Item[] } }>()
const title = computed(() => (props.c.sub !== undefined ? props.c.items[0].subLabel || props.c.sub : props.c.group))
const what = computed(() => kindDef(props.c.items[0].kind))
const note = (m: Item) => (m.fn ? m.fn.status : m.dur || (m.bytes ? m.bytes.toLocaleString('en-US') + ' B' : ''))
</script>

<template>
  <div class="detail">
    <div class="head">
      <div>
        <div class="crumbs">
          <button v-if="c.sub !== undefined" class="crumb" type="button" :title="'Open ' + c.group" @click="selectCategory(c.group)">{{ c.group }}</button>
          <span v-else>{{ what.label }}</span>
        </div>
        <h1 class="cat-title">{{ title }}</h1>
      </div>
      <div class="ref"><span class="cat-count">{{ c.items.length }} {{ c.items.length === 1 ? what.one : what.label }}</span></div>
    </div>
    <section class="card"><ul class="cat-list">
      <li v-for="m in c.items" :key="m.id">
        <button type="button" class="cat-row" @click="select(m.id, true)">
          <span class="label">{{ nameOf(m) }}</span>
          <span v-if="m.name && m.hex" class="idm">{{ m.hex }}</span>
          <span v-if="c.sub === undefined" class="cat-sub">{{ m.subLabel || m.sub }}</span>
          <span class="cat-note">{{ note(m) }}</span>
        </button>
      </li>
    </ul></section>
  </div>
</template>
