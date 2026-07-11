/**
 * App-wide state. Components read slices of this; sendMessage is the single
 * pathway that talks to the copilot and fans results out to map + panels.
 */

import { create } from 'zustand'
import type {
  AddSpotAction,
  ChatResponse,
  Checklist,
  Citation,
  LatLng,
  VendorType,
} from './types/contract'
import { sendChat, ChatClientError } from './lib/chatClient'
import { getSessionId } from './lib/session'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  agent?: ChatResponse['agent']
  error?: boolean
}

export type SheetView = 'peek' | 'chat' | 'spot' | 'permits'

const CHECKLIST_KEY = 'rollaway.checklist'
const DONE_STEPS_KEY = 'rollaway.checklist.done'

function loadStoredChecklist(): Checklist | null {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY)
    if (!raw) return null
    const checklist = JSON.parse(raw) as Checklist
    const done = new Set<number>(
      JSON.parse(localStorage.getItem(DONE_STEPS_KEY) ?? '[]') as number[],
    )
    for (const step of checklist.steps) {
      step.status = done.has(step.order) ? 'done' : 'todo'
    }
    return checklist
  } catch {
    return null
  }
}

interface AppState {
  // chat
  messages: ChatMessage[]
  sending: boolean
  sendMessage: (text: string) => Promise<void>

  // vendor identity
  vendorType: VendorType | null
  setVendorType: (t: VendorType | null) => void

  // map
  mapCenter: LatLng
  setMapCenter: (c: LatLng) => void
  pinnedPoint: LatLng | null
  setPinnedPoint: (p: LatLng | null) => void
  pinMode: boolean
  setPinMode: (on: boolean) => void
  spots: AddSpotAction[]
  /** Incremented each time new spots land, so the map knows to fly to them. */
  spotsEpoch: number

  // panels
  selectedSpotId: string | null
  selectSpot: (id: string | null) => void
  checklist: Checklist | null
  toggleStep: (order: number) => void

  // bottom sheet
  sheetView: SheetView
  setSheetView: (v: SheetView) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hey! I'm your Rollaway copilot. Ask me **where to set up** — or **what permits you need** to get legal. Try a quick prompt below.",
    },
  ],
  sending: false,

  vendorType:
    (localStorage.getItem('rollaway.vendor_type') as VendorType | null) ?? null,
  setVendorType: (t) => {
    if (t) localStorage.setItem('rollaway.vendor_type', t)
    else localStorage.removeItem('rollaway.vendor_type')
    set({ vendorType: t })
  },

  mapCenter: { lat: 37.7793, lng: -122.4013 }, // SoMa, San Francisco
  setMapCenter: (c) => set({ mapCenter: c }),
  pinnedPoint: null,
  setPinnedPoint: (p) => set({ pinnedPoint: p }),
  pinMode: false,
  setPinMode: (on) => set({ pinMode: on, ...(on ? {} : { pinnedPoint: null }) }),
  spots: [],
  spotsEpoch: 0,

  selectedSpotId: null,
  selectSpot: (id) =>
    set({ selectedSpotId: id, ...(id ? { sheetView: 'spot' as const } : {}) }),

  checklist: loadStoredChecklist(),
  toggleStep: (order) => {
    const checklist = get().checklist
    if (!checklist) return
    const steps = checklist.steps.map((s) =>
      s.order === order
        ? { ...s, status: s.status === 'done' ? ('todo' as const) : ('done' as const) }
        : s,
    )
    const next = { ...checklist, steps }
    localStorage.setItem(
      DONE_STEPS_KEY,
      JSON.stringify(steps.filter((s) => s.status === 'done').map((s) => s.order)),
    )
    set({ checklist: next })
  },

  sheetView: 'peek',
  setSheetView: (v) => set({ sheetView: v }),

  sendMessage: async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || get().sending) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }
    set((s) => ({ messages: [...s.messages, userMsg], sending: true }))

    try {
      const res = await sendChat({
        session_id: getSessionId(),
        message: trimmed,
        context: {
          vendor_type: get().vendorType,
          map_center: get().mapCenter,
          pinned_point: get().pinnedPoint,
        },
      })

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.reply_markdown,
        citations: res.citations,
        agent: res.agent,
      }

      const patch: Partial<AppState> = {
        messages: [...get().messages, assistantMsg],
        sending: false,
      }

      if (res.map_actions?.length) {
        const spots = res.map_actions.filter(
          (a): a is AddSpotAction => a.type === 'add_spot',
        )
        patch.spots = spots
        patch.spotsEpoch = get().spotsEpoch + 1
        patch.selectedSpotId = null
      }

      if (res.checklist) {
        patch.checklist = res.checklist
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify(res.checklist))
        localStorage.setItem(DONE_STEPS_KEY, '[]')
      }

      set(patch)
    } catch (err) {
      const message =
        err instanceof ChatClientError
          ? err.message
          : 'Something went wrong. Please try again.'
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: message,
            error: true,
          },
        ],
        sending: false,
      }))
    }
  },
}))
