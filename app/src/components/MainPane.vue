<script setup lang="ts">
// The main pane: a game being opened, the backend gone, the open kind empty, or the selected item.
import UiSpinner from './ui/UiSpinner.vue'
import UiButton from './ui/UiButton.vue'
import EmptyKind from './EmptyKind.vue'
import ModelDetail from './ModelDetail.vue'
import SkeletonDetail from './SkeletonDetail.vue'
import NinjaDetail from './NinjaDetail.vue'
import TextureDetail from './TextureDetail.vue'
import SoundDetail from './SoundDetail.vue'
import CodeDetail from './CodeDetail.vue'
import TextDetail from './TextDetail.vue'
import ImageDetail from './ImageDetail.vue'
import CategoryDetail from './CategoryDetail.vue'
import DecompOverview from './DecompOverview.vue'
import { S, kindItems, selected, selectedCategory, booting, openDisc, openRecent } from '../state'
import { progress } from '../lib/source'
import { kindDef } from '../lib/nav'
</script>

<template>
  <div v-if="booting" class="center"><div class="loading" role="status">
    <UiSpinner :size="20" />
    <span>{{ S.opening ? 'Opening ' + S.opening : S.disc ? 'Loading ' + S.disc.game : 'Loading' }}</span>
    <span v-if="progress > 0" class="mono">{{ Math.round(progress * 100) }}%</span>
  </div></div>
  <div v-else-if="!S.disc" class="center"><div class="empty-kind">
    <h2>Open a Disc</h2>
    <p>Pick the folder of a Dreamcast game, with its .gdi and track files. The disc is read on your computer and never uploaded.</p>
    <div class="actions">
      <UiButton v-if="S.recent[0]" variant="primary" @click="openRecent(S.recent[0])">Reopen {{ S.recent[0] }}</UiButton>
      <UiButton :variant="S.recent[0] ? 'secondary' : 'primary'" @click="openDisc">Open Disc</UiButton>
    </div>
  </div></div>
  <DecompOverview v-else-if="S.overview && S.map && S.map.state === 'ready'" />
  <EmptyKind v-else-if="!kindItems.length" />
  <CategoryDetail v-else-if="selectedCategory" :c="selectedCategory" />
  <template v-else-if="selected">
    <ModelDetail v-if="selected.kind === 'models'" :m="selected" />
    <NinjaDetail v-else-if="selected.kind === 'skeletons' && selected.ninja" :m="selected" />
    <SkeletonDetail v-else-if="selected.kind === 'skeletons'" :m="selected" />
    <TextureDetail v-else-if="selected.kind === 'textures'" :m="selected" />
    <SoundDetail v-else-if="selected.kind === 'audio'" :m="selected" />
    <CodeDetail v-else-if="selected.kind === 'code'" :m="selected" />
    <TextDetail v-else-if="selected.kind === 'text'" :m="selected" />
    <ImageDetail v-else-if="selected.kind === 'images'" :m="selected" />
  </template>
  <div v-else class="center"><div class="empty-kind">
    <h2>Select a {{ kindDef(S.kind).one }}</h2>
    <p>{{ kindItems.length }} {{ kindDef(S.kind).label.toLowerCase() }}, press / to search</p>
  </div></div>
</template>
