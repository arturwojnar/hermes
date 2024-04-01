export type DomainEvent<Name extends string, Data> = Readonly<{
  name: Name
  data: Data
}>
export type MedicineAssigned = DomainEvent<
  'MedicineAssigned',
  {
    medicineId: string
    patientId: string
  }
>
export type MedicineFinished = DomainEvent<
  'MedicineFinished',
  {
    medicineId: string
    patientId: string
  }
>
export type MedicineEvent = MedicineAssigned | MedicineFinished
