<script setup lang="ts">
// The top of a detail pane: breadcrumbs (the group and sub-group show themselves in the list), the title, and the id with copy and, where the decomp allows it, rename.
import { computed } from 'vue'
import UiCopyButton from './ui/UiCopyButton.vue'
import UiIconButton from './ui/UiIconButton.vue'
import { selectCategory } from '../state'
import { nameOf, type Item } from '../lib/dcgs'

const props = defineProps<{ m: Item; refText?: string; rename?: () => void }>()
const id = computed(() => props.refText || props.m.id)
</script>

<template>
  <div class="head">
    <div>
      <div class="crumbs">
        <button class="crumb" type="button" :title="'Open ' + m.group" @click="selectCategory(m.group)">{{ m.group }}</button>
        <span class="sep">/</span>
        <button class="crumb" type="button" :title="'Open ' + (m.subLabel || m.sub)" @click="selectCategory(m.group, m.sub)">{{ m.subLabel || m.sub }}</button>
        <span v-if="m.subLabel" class="idm">{{ m.sub }}</span>
      </div>
      <h1>{{ nameOf(m) }}</h1>
    </div>
    <div class="ref">
      <code>{{ id }}</code>
      <UiCopyButton :text="id" />
      <UiIconButton v-if="rename" variant="ghost" title="Rename" aria-label="Rename" @click="rename">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>
      </UiIconButton>
    </div>
  </div>
</template>
