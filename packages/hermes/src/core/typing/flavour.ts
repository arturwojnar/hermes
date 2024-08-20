export const __FLAVOUR_TYPE__ = Symbol('__flavour')

type StringLiteral<Type> = Type extends string ? (string extends Type ? never : Type) : never

export type WithFlavour<T extends string> = {
  readonly __flavour?: T
}

export type WithoutFlavour<T> = Omit<T, '__flavour'>

export type Flavour<K, T> = T extends StringLiteral<T> ? WithoutFlavour<K> & WithFlavour<T> : never
