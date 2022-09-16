namespace saga {
  export class CallError extends Error {
    constructor(name: any, arg: any, stepIndex: number, ex: any) {
      super(
        // eslint-disable-next-line max-len
        `name: ${JSON.stringify(name)}, arg: ${JSON.stringify(
          arg,
        )}, stepIndex: ${stepIndex}, err: [${JSON.stringify(
          ex?.message || ex,
        )}]`,
        // @ts-ignore
        {
          cause: ex instanceof Error ? ex : undefined,
        },
      )
      this.name = 'CallError'
    }

    toJSON() {
      return JSON.stringify(errorToObj(this))
    }
  }

  export class SagaRunnerError extends Error {
    constructor(error: any) {
      super(
        error?.message || error,
        // @ts-ignore
        {
          cause: error instanceof Error ? error : undefined,
        },
      )
      this.name = 'SagaRunnerError'
    }

    toJSON() {
      return JSON.stringify(errorToObj(this))
    }
  }

  export class SagaCorruptedError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'SagaCorruptedError'
    }

    toJSON() {
      return JSON.stringify(errorToObj(this))
    }
  }

  export class InverseError extends Error {
    constructor(name: any, stepIndex: number, ex: any) {
      super(
        `name: ${JSON.stringify(
          name,
        )}, stepIndex: ${stepIndex}, err: [${JSON.stringify(
          ex?.message || ex,
        )}]`,
        // @ts-ignore
        {
          cause: ex instanceof Error ? ex : undefined,
        },
      )
      this.name = 'InverseError'
    }

    toJSON() {
      return JSON.stringify(errorToObj(this))
    }
  }

  export class PayloadMismatchError extends Error {
    constructor(
      name: string,
      id: string,
      oldPayload: CmdPayload,
      newPayload: CmdPayload,
    ) {
      super(
        `Saga ${name} with id ${id} ` +
          `already exist with different payload. newPayload: ${JSON.stringify(
            newPayload,
          )}, ` +
          `oldPayload: ${JSON.stringify(oldPayload)}`,
      )
      this.name = 'PayloadMismatchError'
    }

    toJSON() {
      return JSON.stringify(errorToObj(this))
    }
  }

  export function errorToObj(ex: any) {
    function toObj(ex: any, seen: any[]): any {
      if (ex instanceof Error) {
        const seenIndex = seen.indexOf(ex)

        if (seenIndex !== -1) {
          return seenIndex
        }
        seen.push(ex)
        return {
          name: ex.name,
          message: ex.message,
          stack: ex.stack,
          cause: ex.cause ? toObj(ex.cause, seen) : undefined,
        }
      } else {
        return ex
      }
    }
    return toObj(ex, [])
  }

  export function objToError(obj: any) {
    function fromObj(obj: any, seen: any[]): any {
      if (obj !== undefined) {
        if (typeof obj === 'number') {
          if (seen.length > obj) {
            return seen[obj]
          } else {
            return obj
          }
        } else {
          const constructor = getErrorConstructor(obj.name)
          // 预想用下面注释的方法，但Error的实例创建时会生产stack，效率会差
          // const ex = new Error()

          if (constructor === undefined) {
            return obj
          }

          const ex: any = {}

          // eslint-disable-next-line no-proto
          ex.__proto__ = constructor.prototype

          seen.push(ex)

          ex.name = obj.name
          ex.message = obj.message
          ex.stack = obj.stack
          ex.cause = fromObj(obj.cause, seen)
          return ex
        }
      }
    }
    return fromObj(obj, [])
  }

  type ErrorConstructor = new () => Error
  const customerErrorMap = {} as { [name: string]: ErrorConstructor }

  function registorCustomerError(...constractor: (new () => Error)[]) {
    for (const c of constractor) {
      customerErrorMap[c.name] = c
    }
  }

  function getErrorConstructor(name: string) {
    const g = globalThis as any

    return g[name] || customerErrorMap[name]
  }

  // @ts-ignore
  // eslint-disable-next-line no-extend-native
  Error.prototype.toJSON = function () {
    return errorToObj(this)
  }

  registorCustomerError(
    CallError as any,
    SagaRunnerError as any,
    InverseError as any,
    PayloadMismatchError as any,
    SagaCorruptedError as any,
  )
}
