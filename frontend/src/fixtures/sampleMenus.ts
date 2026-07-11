export const SAMPLE_MENUS = [
  {
    id: 'mexican',
    label: 'Mexican',
    items: ['Al pastor taco $5', 'Veggie burrito $11', 'Horchata $4'],
  },
  {
    id: 'filipino',
    label: 'Filipino',
    items: ['Chicken adobo bowl $14', 'Pancit noodles $12', 'Ube turon $6'],
  },
  {
    id: 'chinese',
    label: 'Chinese',
    items: ['Pork dumplings $9', 'Dan dan noodles $13', 'Scallion pancake $6'],
  },
  {
    id: 'indian',
    label: 'Indian',
    items: ['Chicken tikka wrap $13', 'Chana masala bowl $12', 'Mango lassi $5'],
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    items: ['Chicken shawarma pita $13', 'Falafel bowl $12', 'Hummus and pita $7'],
  },
  {
    id: 'american',
    label: 'American',
    items: ['Classic cheeseburger $14', 'Crispy chicken sandwich $13', 'Seasoned fries $6'],
  },
  {
    id: 'coffee_dessert',
    label: 'Coffee & Dessert',
    items: ['Cold brew $5', 'Vanilla latte $6', 'Chocolate chip cookie $4'],
  },
] as const

export type CuisineSample = (typeof SAMPLE_MENUS)[number]
export type CuisineId = CuisineSample['id']

export function sampleMenuText(cuisine: CuisineId): string {
  return SAMPLE_MENUS.find((sample) => sample.id === cuisine)?.items.join('\n') ?? ''
}
