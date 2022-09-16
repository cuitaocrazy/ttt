namespace saga {
  /**
   * 判断是否是CallEffect
   * @param effect
   * @returns
   */
  export function isCallEffect(effect: EffectWrapper): effect is CallEffect {
    return effect[effectSymbol] === 'call'
  }

  /**
   * 延迟函数
   *
   * @param ms 毫秒数
   * @returns
   */
  export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  export async function* iterFilter<T = unknown, TReturn = any>(
    iter: AsyncGenerator<T, TReturn, void>,
    filter: (t: T) => boolean,
  ): AsyncGenerator<T, TReturn, void> {
    while (true) {
      const { done, value } = await iter.next()

      if (done) {
        return await value
      }

      if (filter(value)) {
        yield value
      }
    }
  }

  export function payloadEqual(a: CmdPayload, b: CmdPayload) {
    function objEqual(o1: any, o2: any): boolean {
      if (o1 === o2) {
        return true
      } else {
        if (typeof o1 === 'object' && typeof o2 === 'object') {
          const o1Keys = Object.keys(o1).sort()
          const o2Keys = Object.keys(o2).sort()

          if (o1Keys.length !== o2Keys.length) {
            return false
          }

          const keyMatched = o1Keys.reduce(
            (s, e, i) => s && e === o2Keys[i],
            true,
          )

          if (!keyMatched) {
            return false
          }

          for (let i = 0; i < o1Keys.length; i++) {
            const matched = objEqual(o1[o1Keys[i]], o2[o2Keys[i]])

            if (!matched) {
              return false
            }
          }

          return true
        }

        return false
      }
    }

    return objEqual(a, b)
  }

  export function nop() {}

  export function createPromiseLock() {
    let resolve: (val?: any) => void = nop
    let reject: (reason?: any) => void = nop
    // eslint-disable-next-line promise/param-names
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }
}
