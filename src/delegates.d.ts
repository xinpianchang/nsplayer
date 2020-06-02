declare module 'delegates' {
  namespace Delegate {
    interface Delegator<T = any> {
      method: (property: keyof T) => Delegator<T>
      getter: (property: keyof T) => Delegator<T>
      setter: (property: keyof T) => Delegator<T>
      access: (property: keyof T) => Delegator<T>
      fluent: (property: keyof T) => Delegator<T>
    }
  }
  type GET_TYPE<T, P> = P extends keyof T ? NonNullable<T[P]> : never
  const Delegate: <T, P extends string>(proto: T, property: P) => Delegate.Delegator<GET_TYPE<T, P>>
  export = Delegate
}
