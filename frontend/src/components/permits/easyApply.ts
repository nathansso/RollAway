import type {
  EasyApplyFieldKey,
  PermitChecklistItem,
  VendorProfile,
} from '../../types/contract'

export type EasyApplyValues = Record<EasyApplyFieldKey, string>

export function buildEasyApplyValues(
  item: PermitChecklistItem,
  profile: VendorProfile,
): Partial<EasyApplyValues> {
  const values: Partial<EasyApplyValues> = {}
  for (const field of item.fields) {
    if (field.key in profile.autofill_profile) {
      values[field.key] = profile.autofill_profile[
        field.key as keyof VendorProfile['autofill_profile']
      ]
      continue
    }
    if (field.key === 'vendor_type') values[field.key] = profile.vendor_type
    else if (field.key === 'menu') values[field.key] = profile.menu.raw
    else if (field.key === 'location') values[field.key] = profile.home_base.label
    else values[field.key] = ''
  }
  return values
}
