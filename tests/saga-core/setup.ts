namespace saga {
  export const { expect }: typeof import('chai') = require('chai')
  export const sinon: typeof import('sinon') = require('sinon')

  export const pushInverse =
    (inverses: Inverse[]) => (inverse: () => Promise<void>) =>
      inverses.push({
        name: 'test inverse',
        stepIndex: 0,
        inverse,
      })

  export const makeCallSpec = <ARG, RET>(
    name: string,
    probeCmd: 'success' | 'recall' | 'inverse',
    callRet: RET | (() => Promise<RET>),
    probeRet?: RET,
    callIsErr?: boolean,
  ) => {
    const pr: EnhancedCallProbeResult<RET> = {
      responseCommand: probeCmd,
      ret: probeRet,
    }

    const probe = sinon.fake.returns<[ARG]>(Promise.resolve(pr))

    const call = callRet instanceof Function ?
      sinon.fake<[ARG]>(callRet) :
      sinon.fake.returns<[ARG]>(
        callIsErr ? Promise.reject(callRet) : Promise.resolve(callRet),
      )
      
    const inverse = sinon.fake.returns<[ARG, { becalled: boolean; ret?: RET }]>(
      Promise.resolve(),
    )

    const callSpec: CallSpec<ARG, RET> = {
      name,
      probe,
      call,
      inverse,
    }

    return { callSpec, probe, call, inverse }
  }

  export const makeCallEffect = <ARG, RET>(
    name: string,
    probeCmd: 'success' | 'recall' | 'inverse',
    arg: ARG,
    callRet: RET,
    probeRet?: RET,
    callIsErr = false,
  ) => {
    const { callSpec, probe, call, inverse } = makeCallSpec(
      name,
      probeCmd,
      callRet,
      probeRet,
      callIsErr,
    )

    const callEffect: CallEffect<ARG, RET> = {
      [effectSymbol]: 'call',
      effect: callSpec,
      arg,
    }

    return {
      effect: callEffect,
      probe,
      call,
      inverse,
    }
  }
}
