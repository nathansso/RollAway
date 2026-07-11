import type { VendorType } from '../types/contract'

// Authored `profile_key -> real AcroForm field name` maps, per verified form `source` id.
// Field names were enumerated directly from each agency PDF (pdf-lib getFields()). We only map
// fields we can fill confidently from the vendor's own data; every other field on the PDF is left
// blank — we never place a value on a legal form we cannot ground. `vendorTypeCheckbox` names the
// checkbox to tick for each vendor type where the form offers one.
export interface PdfFieldMap {
  text: Record<string, string>
  vendorTypeCheckbox?: Partial<Record<VendorType, string>>
}

export const PDF_FIELD_MAPS: Record<string, PdfFieldMap> = {
  'sfpw-mff': {
    text: {
      'Business DBA Name': 'business_name',
      'Applicant Name': 'owner_name',
      Phone: 'phone',
      EMail: 'email',
      'Mailing Address': 'address',
      City: 'city',
      State: 'state',
      Zip: 'postal_code',
      'License Plate': 'vehicle_plate',
      'Location 1': 'pinned_point',
      'Proposed Menu': 'menu',
    },
    vendorTypeCheckbox: {
      truck: 'Truck',
      pushcart_cooking: 'Push Cart',
      pushcart_nocook: 'Push Cart',
    },
  },
  'sfdph-mff': {
    text: {
      'Registered Owner': 'owner_name',
      DBA: 'business_name',
      '2_Business_Address': 'address',
      'Print Name': 'owner_name',
    },
  },
  'sffd-permit': {
    text: {
      'APPLICANTS BUSINESS NAME dba': 'business_name',
      'PERMIT HOLDER': 'owner_name',
      TELEPHONE: 'phone',
      'APPLICANTS BILLING ADDRESS': 'address',
      CITY: 'city',
      STATE: 'state',
      'ZIP CODE': 'postal_code',
      'PERMIT ADDRESS': 'pinned_point',
      'Print name of Applicant or Agent circle one': 'owner_name',
    },
  },
}

export function hasPdfFieldMap(source: string | undefined | null): boolean {
  return !!source && source in PDF_FIELD_MAPS
}
