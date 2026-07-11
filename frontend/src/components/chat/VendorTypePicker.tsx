/**
 * Segmented vendor-type chips. Bound to store.vendorType, which the store
 * already persists to localStorage and sends as context on every request.
 */

import { useAppStore } from '../../store'
import type { VendorType } from '../../types/contract'

const OPTIONS: ReadonlyArray<{ value: VendorType; label: string }> = [
  { value: 'truck', label: 'Truck' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'pushcart_cooking', label: 'Cart + cooking' },
  { value: 'pushcart_nocook', label: 'Cart no-cook' },
]

export default function VendorTypePicker() {
  const vendorType = useAppStore((s) => s.vendorType)
  const setVendorType = useAppStore((s) => s.setVendorType)

  return (
    <div className="px-4 pb-2">
      <p
        id="vendor-type-label"
        className="mb-1.5 text-xs font-medium text-muted-foreground"
      >
        I sell from a…
      </p>
      <div
        role="radiogroup"
        aria-labelledby="vendor-type-label"
        className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {OPTIONS.map((opt) => {
          const active = vendorType === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVendorType(active ? null : opt.value)}
              className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-muted text-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
