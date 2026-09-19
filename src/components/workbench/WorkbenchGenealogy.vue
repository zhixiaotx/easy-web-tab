<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import RecordsCard from '@/components/common/RecordsCard.vue'
import GenealogyTreeNode from '@/components/workbench/GenealogyTreeNode.vue'
import { useToast } from '@/composables/useToast'
import { useGenealogyStore } from '@/stores/genealogy'
import { buildTree, getChildren, getDescendants } from '@/composables/genealogyCore'
import type { FamilyMember } from '@/types'
import { usePageSize } from '@/composables/usePageSize'

const store = useGenealogyStore()
const vm = useViewMode()
const toast = useToast()

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', '': '未知' }

// ===== Tab：成员管理 / 家谱树 =====
type TabKey = 'members' | 'tree'
const activeTab = ref<TabKey>('members')

// ===== 搜索（按姓名）=====
const searchName = ref('')

// ===== 分页（固定 10 条/页）=====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('fg-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)

const filteredMembers = computed<FamilyMember[]>(() => {
  const q = searchName.value.trim().toLowerCase()
  if (!q) return store.members
  return store.members.filter((m) => m.name.toLowerCase().includes(q))
})

const pageMembers = computed<FamilyMember[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return filteredMembers.value.slice(start, start + pageSize.value)
})

watch(
  () => filteredMembers.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / pageSize.value))
    if (listPage.value > maxPage) listPage.value = maxPage
  }
)

function relationSummary(m: FamilyMember): string {
  const children = getChildren(store.members, m.id).length
  return `父${m.parents.length} · 子${children} · 偶${m.spouses.length}`
}

function memberName(id: string): string {
  return store.members.find((m) => m.id === id)?.name ?? '(已删除)'
}

function cardFields(m: FamilyMember) {
  return [
    { label: '姓名', value: m.name, emphasis: true },
    { label: '性别', value: GENDER_LABEL[m.gender ?? ''] ?? '未知' },
    { label: '出生日期', value: m.birthDate || '—' },
    { label: '关系', value: relationSummary(m) }
  ]
}

// ===== 成员新增/编辑弹框 =====
const showMemberDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formGender = ref<'male' | 'female' | ''>('')
const formBirth = ref('')
const formDeath = ref('')
const formPhone = ref('')
const formNote = ref('')
const formAvatar = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)

/** 读取图片文件 → 压缩为 ≤256px 的 JPEG base64 data URL（头像存储用，避免原图体积过大撑爆云同步信封） */
function readImageAsDataURL(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 不可用'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

async function onAvatarChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件')
    input.value = ''
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    toast.error('图片过大（上限 8MB）')
    input.value = ''
    return
  }
  try {
    formAvatar.value = await readImageAsDataURL(file)
  } catch {
    toast.error('头像读取失败')
  } finally {
    input.value = ''
  }
}

function clearAvatar(): void {
  formAvatar.value = ''
}

function triggerAvatarInput(): void {
  avatarInput.value?.click()
}

const isMemberFormValid = computed(() => {
  const n = formName.value.trim().length
  return n > 0 && n <= 50
})

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formGender.value = ''
  formBirth.value = ''
  formDeath.value = ''
  formPhone.value = ''
  formNote.value = ''
  formAvatar.value = ''
  showMemberDialog.value = true
}

function startEdit(m: FamilyMember): void {
  editingId.value = m.id
  formName.value = m.name
  formGender.value = (m.gender ?? '') as 'male' | 'female' | ''
  formBirth.value = m.birthDate ?? ''
  formDeath.value = m.deathDate ?? ''
  formPhone.value = m.phone ?? ''
  formNote.value = m.note ?? ''
  showMemberDialog.value = true
}

function cancelMember(): void {
  showMemberDialog.value = false
  editingId.value = null
}

async function handleSaveMember(): Promise<void> {
  const name = formName.value.trim()
  if (name.length === 0 || name.length > 50) return
  const input = {
    name,
    gender: formGender.value,
    birthDate: formBirth.value || undefined,
    deathDate: formDeath.value || undefined,
    phone: formPhone.value.trim() || undefined,
    note: formNote.value.trim() || undefined,
    avatar: formAvatar.value || undefined
  }
  if (editingId.value) {
    await store.updateMember(editingId.value, input)
    toast.success('已保存修改')
  } else {
    await store.addMember(input)
    listPage.value = 1
    toast.success('已新增成员')
  }
  cancelMember()
}

async function handleDelete(m: FamilyMember): Promise<void> {
  const children = getChildren(store.members, m.id)
  const childTip = children.length > 0 ? `其子/女（${children.map((c) => c.name).join('、')}）将保留为孤儿。` : ''
  if (window.confirm(`确定删除「${m.name}」吗？\n${childTip}\n（仅删除该成员，并清理他人对其的父母/配偶引用，不做级联删除。）`)) {
    await store.deleteMember(m.id)
    toast.success('已删除')
  }
}

// ===== 关系管理弹框 =====
const showRelDialog = ref(false)
const relMember = ref<FamilyMember | null>(null)
const parentPick = ref('')
const spousePick = ref('')

// 可选父母：排除自己、已有的父母、以及自己的后代（防环）
const parentOptions = computed<FamilyMember[]>(() => {
  const m = relMember.value
  if (!m) return []
  const banned = new Set<string>([m.id, ...m.parents, ...getDescendants(store.members, m.id).map((d) => d.id)])
  return store.members.filter((x) => !banned.has(x.id))
})

// 可选配偶：排除自己、已有的配偶（一对一：已有配偶时禁止再加）
const spouseOptions = computed<FamilyMember[]>(() => {
  const m = relMember.value
  if (!m) return []
  const banned = new Set<string>([m.id, ...m.spouses])
  return store.members.filter((x) => !banned.has(x.id))
})

function openRel(m: FamilyMember): void {
  relMember.value = m
  parentPick.value = ''
  spousePick.value = ''
  showRelDialog.value = true
}

function closeRel(): void {
  showRelDialog.value = false
  relMember.value = null
}

async function addParent(): Promise<void> {
  const m = relMember.value
  if (!m || !parentPick.value) return
  const ok = await store.setParent(m.id, parentPick.value)
  if (!ok) {
    toast.error('添加后会产生血缘环，已阻止')
    return
  }
  toast.success('已添加父母关系')
  parentPick.value = ''
}

async function addSpouse(): Promise<void> {
  const m = relMember.value
  if (!m || !spousePick.value || m.spouses.length > 0) return
  const ok = await store.setSpouse(m.id, spousePick.value)
  if (!ok) {
    toast.error('无法设置配偶关系')
    return
  }
  toast.success('已设置配偶关系')
  spousePick.value = ''
}

async function removeParentOf(pId: string): Promise<void> {
  const m = relMember.value
  if (!m) return
  await store.removeParent(m.id, pId)
}

async function removeSpouseOf(sId: string): Promise<void> {
  const m = relMember.value
  if (!m) return
  await store.removeSpouse(m.id, sId)
}

// ===== 主根 =====
async function setRoot(m: FamilyMember): Promise<void> {
  await store.setRoot(m.id)
  toast.success(`已将「${m.name}」设为主根`)
}

async function clearRoot(): Promise<void> {
  await store.clearRoot()
  toast.info('已取消主根')
}

// ===== 家谱树（递归思维导图组件，折叠态由各节点内部维护）=====
const treeRoots = computed(() => buildTree(store.members, store.rootId))
const hasRoot = computed(() => store.rootId !== null && store.members.some((m) => m.id === store.rootId))

function rootName(): string {
  const r = store.members.find((m) => m.id === store.rootId)
  return r ? r.name : ''
}

// ===== 键盘：ESC 关闭弹框 =====
function handleKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (showMemberDialog.value) {
    e.preventDefault()
    cancelMember()
  } else if (showRelDialog.value) {
    e.preventDefault()
    closeRel()
  }
}

onMounted(async () => {
  await store.load()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-genealogy">
    <!-- Tab 切换：成员管理 / 家谱树 -->
    <div class="fg-tabs" role="tablist">
      <button
        class="fg-tab"
        :class="{ active: activeTab === 'members' }"
        role="tab"
        :aria-selected="activeTab === 'members'"
        data-testid="fg-tab-members"
        @click="activeTab = 'members'"
      >成员管理</button>
      <button
        class="fg-tab"
        :class="{ active: activeTab === 'tree' }"
        role="tab"
        :aria-selected="activeTab === 'tree'"
        data-testid="fg-tab-tree"
        @click="activeTab = 'tree'"
      >家谱树</button>
    </div>

    <!-- ========== 成员管理 ========== -->
    <template v-if="activeTab === 'members'">
      <div class="ewt-table-toolbar is-split">
        <div class="td-toolbar-left">
          <el-button type="primary" size="small" class="btn-add" data-testid="fg-add-button" @click="startAdd">＋ 新增成员</el-button>
          <el-input
            v-model="searchName"
            size="small"
            class="fg-search"
            placeholder="按姓名搜索…"
            clearable
            data-testid="fg-search"
            @keyup.enter="listPage = 1"
            @clear="listPage = 1"
          />
        </div>
        <ViewModeToggle v-if="filteredMembers.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>

      <div v-if="store.members.length === 0" class="empty-state empty-invite" data-testid="fg-empty" @click="startAdd">
        ＋ 新增第一个家庭成员
      </div>

      <div v-else-if="filteredMembers.length === 0" class="empty-state filter-empty" data-testid="fg-filter-empty">
        <span>没有符合搜索条件的成员</span>
        <button class="btn-cancel" @click="searchName = ''; listPage = 1">清除搜索</button>
      </div>

      <template v-else>
        <div class="fg-table-wrap">
          <el-table
            v-if="vm.mode === 'list'"
            class="ewt-table"
            :data="pageMembers"
            data-testid="fg-table"
            @row-click="(row: FamilyMember) => startEdit(row)"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="没有符合搜索条件的成员"
          >
            <el-table-column label="姓名" min-width="160" align="center" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="fg-name">
                  <img v-if="row.avatar" :src="row.avatar" class="fg-name-avatar" :alt="row.name" />
                  <span v-else class="fg-name-initial">{{ (row.name || '?').slice(0, 1) }}</span>
                  {{ row.name }}
                  <span v-if="store.rootId === row.id" class="fg-root-badge">主根</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="性别" width="90" align="center">
              <template #default="{ row }">{{ GENDER_LABEL[row.gender ?? ''] ?? '未知' }}</template>
            </el-table-column>
            <el-table-column label="出生日期" width="140" align="center">
              <template #default="{ row }">
                <span v-if="row.birthDate">{{ row.birthDate }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="关系" min-width="160" align="center">
              <template #default="{ row }">
                <span class="fg-rel">{{ relationSummary(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="280" align="center" fixed="right">
              <template #default="{ row }">
                <div class="td-actions" @click.stop>
                  <el-button size="small" :data-testid="`fg-rel-${row.id}`" @click="openRel(row)">关系</el-button>
                  <el-button size="small" :data-testid="`fg-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                  <el-button
                    v-if="store.rootId !== row.id"
                    size="small"
                    :data-testid="`fg-root-${row.id}`"
                    @click="setRoot(row)"
                  >设主根</el-button>
                  <el-button size="small" class="btn-delete" :data-testid="`fg-delete-${row.id}`" @click="handleDelete(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="ewt-card-grid">
            <RecordsCard
              v-for="m in pageMembers"
              :key="m.id"
              :fields="cardFields(m)"
              @edit="startEdit(m)"
            />
          </div>
        </div>

        <div class="fg-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="listPage"
            @size-change="listPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredMembers.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
            data-testid="fg-pagination"
          />
        </div>
      </template>
    </template>

    <!-- ========== 家谱树（思维导图式递归）========== -->
    <template v-else>
      <div class="fg-tree-bar">
        <template v-if="hasRoot">
          <span class="fg-tree-info">主根：<b>{{ rootName() }}</b></span>
          <el-button size="small" class="btn-cancel" data-testid="fg-clear-root" @click="clearRoot">取消主根</el-button>
        </template>
        <span v-else class="fg-tree-info fg-tree-muted">未设主根，按「无父母的成员」展示为多棵根树</span>
      </div>

      <div v-if="treeRoots.length === 0" class="empty-state" data-testid="fg-tree-empty">
        暂无家谱数据，请先在「成员管理」中新增成员并建立关系
      </div>

      <div v-else class="fg-mindmap">
        <GenealogyTreeNode
          v-for="root in treeRoots"
          :key="root.member.id"
          :node="root"
          data-testid="fg-tree-root-node"
        />
      </div>
    </template>

    <!-- 成员新增/编辑弹框 -->
    <el-dialog
      :model-value="showMemberDialog"
      :title="editingId ? '编辑成员' : '新增成员'"
      width="480px"
      data-testid="fg-member-dialog"
      @close="cancelMember"
      @update:model-value="(v: boolean) => { if (!v) cancelMember() }"
    >
      <form class="dialog-body" @submit.prevent="handleSaveMember">
        <div class="form-group">
          <label>姓名 *</label>
          <el-input
            v-model="formName"
            placeholder="例如：张三"
            maxlength="50"
            data-testid="fg-name-input"
            @keyup.enter="handleSaveMember"
          />
        </div>
        <div class="form-group">
          <label>头像（可选）</label>
          <div class="avatar-uploader">
            <div class="avatar-preview" :class="{ empty: !formAvatar }">
              <img v-if="formAvatar" :src="formAvatar" alt="头像预览" />
              <span v-else class="avatar-placeholder">无</span>
            </div>
            <div class="avatar-actions">
              <input ref="avatarInput" type="file" accept="image/*" class="avatar-file" data-testid="fg-avatar-input" @change="onAvatarChange" />
              <el-button size="small" data-testid="fg-avatar-upload" @click="triggerAvatarInput">上传头像</el-button>
              <el-button v-if="formAvatar" size="small" class="btn-cancel" data-testid="fg-avatar-clear" @click="clearAvatar">移除</el-button>
            </div>
          </div>
        </div>
        <div class="form-row-fields">
          <div class="field">
            <label class="field-label">性别</label>
            <el-select v-model="formGender" class="field-gender" data-testid="fg-gender">
              <el-option value="" label="未知" />
              <el-option value="male" label="男" />
              <el-option value="female" label="女" />
            </el-select>
          </div>
          <div class="field">
            <label class="field-label">出生日期</label>
            <el-date-picker
              v-model="formBirth"
              type="date"
              value-format="YYYY-MM-DD"
              class="field-date"
              placeholder="选择日期"
              data-testid="fg-birth"
            />
          </div>
        </div>
        <div class="form-group">
          <label>去世日期（可选）</label>
          <el-date-picker
            v-model="formDeath"
            type="date"
            value-format="YYYY-MM-DD"
            class="field-date"
            placeholder="选择日期"
            data-testid="fg-death"
          />
        </div>
        <div class="form-group">
          <label>联系电话（可选）</label>
          <el-input v-model="formPhone" placeholder="选填" data-testid="fg-phone" />
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <el-input v-model="formNote" type="textarea" :rows="2" placeholder="补充说明…" data-testid="fg-note" />
        </div>
        <div class="form-actions ewt-dialog-footer">
          <el-button size="small" data-testid="fg-cancel-button" @click="cancelMember">取消</el-button>
          <el-button type="primary" size="small" :disabled="!isMemberFormValid" data-testid="fg-save-button" @click="handleSaveMember">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" size="small" native-type="button" data-testid="fg-record-delete" @click="handleDelete({ id: editingId, name: formName } as FamilyMember)">删除</el-button>
        </div>
      </form>
    </el-dialog>

    <!-- 关系管理弹框 -->
    <el-dialog
      :model-value="showRelDialog"
      :title="relMember ? `关系管理 · ${relMember.name}` : '关系管理'"
      width="480px"
      data-testid="fg-rel-dialog"
      @close="closeRel"
      @update:model-value="(v: boolean) => { if (!v) closeRel() }"
    >
      <div v-if="relMember" class="fg-rel-body">
        <div class="fg-rel-section">
          <div class="fg-rel-title">父母（{{ relMember.parents.length }}）</div>
          <div v-if="relMember.parents.length === 0" class="fg-rel-empty">尚未设置父母</div>
          <div v-for="p in relMember.parents" :key="p" class="fg-rel-item">
            <span>{{ memberName(p) }}</span>
            <el-button size="small" class="btn-delete" @click="removeParentOf(p)">解除</el-button>
          </div>
          <div class="fg-rel-add">
            <el-select v-model="parentPick" placeholder="选择要添加的父母" size="small" class="fg-rel-select" :disabled="parentOptions.length === 0">
              <el-option v-for="o in parentOptions" :key="o.id" :value="o.id" :label="o.name" />
            </el-select>
            <el-button size="small" type="primary" :disabled="!parentPick" @click="addParent">添加</el-button>
          </div>
          <div v-if="parentOptions.length === 0" class="fg-rel-hint">已无可选成员（排除自己、现有父母与后代）</div>
        </div>

        <div class="fg-rel-section">
          <div class="fg-rel-title">配偶（一对一）</div>
          <div v-if="relMember.spouses.length === 0" class="fg-rel-empty">尚未设置配偶</div>
          <div v-for="s in relMember.spouses" :key="s" class="fg-rel-item">
            <span>{{ memberName(s) }}</span>
            <el-button size="small" class="btn-delete" @click="removeSpouseOf(s)">解除</el-button>
          </div>
          <div v-if="relMember.spouses.length === 0" class="fg-rel-add">
            <el-select v-model="spousePick" placeholder="选择配偶" size="small" class="fg-rel-select" :disabled="spouseOptions.length === 0">
              <el-option v-for="o in spouseOptions" :key="o.id" :value="o.id" :label="o.name" />
            </el-select>
            <el-button size="small" type="primary" :disabled="!spousePick" @click="addSpouse">设置</el-button>
          </div>
          <div v-else class="fg-rel-hint">配偶为一对一，请先解除现有配偶再设置</div>
        </div>
      </div>
      <div class="form-actions ewt-dialog-footer">
        <el-button size="small" @click="closeRel">关闭</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.wb-genealogy {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== Tab ===== */
.fg-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.fg-tab {
  padding: 8px 18px;
  font-size: 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.fg-tab:hover { color: var(--color-primary, #3b82f6); }
.fg-tab.active {
  color: var(--color-primary, #3b82f6);
  border-bottom-color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

/* ===== 搜索 / 工具栏 ===== */
.fg-search { width: 200px; }
.td-toolbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* ===== 表格容器 ===== */
.fg-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.fg-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(59, 130, 246, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.fg-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.fg-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .fg-table-wrap > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .fg-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .fg-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}

/* ===== 分页条（沿用双视图面板惯例 + 显式上色覆盖）===== */
.fg-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .fg-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内元素 ===== */
.fg-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #111827);
}
.fg-root-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  background: var(--color-primary, #3b82f6);
}
.fg-rel { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.td-col-empty { color: var(--color-text-muted, #9ca3af); font-size: 12px; }

.td-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}
.btn-delete:hover { color: var(--color-error, #ef4444); border-color: var(--color-error, #ef4444); }

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, #fff);
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #64748b);
  transition: color 0.15s ease, border-color 0.15s ease;
}
.empty-invite:hover { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.filter-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.btn-cancel {
  padding: 6px 12px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-cancel:hover { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }

/* ===== 家谱树 ===== */
.fg-tree-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.fg-tree-info { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.fg-tree-muted { color: var(--color-text-muted, #9ca3af); }
.fg-mindmap { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
.fg-rel { font-size: 12px; color: var(--color-text-secondary, #6b7280); }

/* ===== 关系弹框 ===== */
.fg-rel-body { display: flex; flex-direction: column; gap: 18px; }
.fg-rel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.fg-rel-title { font-size: 13px; font-weight: 600; color: var(--color-text, #111827); }
.fg-rel-empty { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.fg-rel-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--color-text, #111827); }
.fg-rel-add { display: flex; gap: 8px; }
.fg-rel-select { flex: 1; }
.fg-rel-hint { font-size: 12px; color: var(--color-text-muted, #9ca3af); }

/* ===== 弹框通用 ===== */
.dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group > label { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.form-row-fields { display: flex; gap: 10px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.field-gender { width: 140px; }
.field-date { width: 170px; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ===== 头像上传 ===== */
.avatar-uploader { display: flex; align-items: center; gap: 14px; }
.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-card, #fff);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.avatar-actions { display: flex; align-items: center; gap: 8px; }
.avatar-file { display: none; }
.fg-name-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.fg-name-initial {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #3b82f6);
}
html.dark .avatar-preview { background: var(--color-bg-card, #1f2937); }

/* ===== 暗色覆盖 ===== */
html.dark .fg-tab { color: var(--color-text-secondary, #d1d5db); }
html.dark .fg-tab:hover, html.dark .fg-tab.active { color: #60a5fa; border-bottom-color: #3b82f6; }
html.dark .empty-state { background-color: var(--color-bg-card, #1f2937); }
html.dark .fg-name { color: var(--color-text, #f9fafb); }
html.dark .fg-tree-bar { background-color: var(--color-bg-card, #1f2937); }
html.dark .fg-rel-section { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }
html.dark .fg-rel-title { color: var(--color-text, #f9fafb); }
html.dark .fg-rel-item { color: var(--color-text, #f9fafb); }
html.dark .form-group > label, html.dark .field-label { color: var(--color-text-secondary, #d1d5db); }
html.dark .btn-cancel { background-color: var(--color-bg-card, #1f2937); color: var(--color-text-secondary, #d1d5db); border-color: var(--color-border, #374151); }
</style>
