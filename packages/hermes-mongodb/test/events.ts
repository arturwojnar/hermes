export type Event<Name extends string, Data> = Readonly<{
  name: Name
  data: Data
}>
export type MedicineAdded = Event<
  'MedicineAdded',
  {
    medicineId: string
    patientId: string
  }
>
export type MedicineRemoved = Event<
  'MedicineRemoved',
  {
    medicineId: string
    patientId: string
  }
>
export type MedicineEvent = MedicineAdded | MedicineRemoved

export const generateEvent = (medicineId: string): MedicineAdded => ({
  name: 'MedicineAdded',
  data: {
    medicineId,
    patientId: 'patient99',
  },
})
