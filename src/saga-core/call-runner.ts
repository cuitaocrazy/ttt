namespace saga {
  /**
   * 通用的副作用执行器
   *
   * runner只接收或产出3种日志类型：`call`, `ex`, `precall`
   *
   * runner可返回副作用函数的执行结果或抛出错误
   *
   * `precall`和`call`日志配合使用, 有3种组合：
   *
   * | type | precall | call     |
   * |------|---------|----------|
   * | 1    | T       | T        |
   * | 2    | T       | F        |
   * | 3    | F       | -        |
   *
   * 1. 不做处理, 直接返回`probe`的返回值
   * 2. 根据`probe`的返回结果处理
   *    - `success` 返回`probe`的返回值
   *    - `inverse` 先调用`inverse`再执行副作用函数
   *    - `recall` 直接执行副作用函数
   * 3. 正常调用副作用函数
   *
   * ***注意***: runner不会检查`precall`的类型
   *
   * 当有异常或有异常日志时, runner会抛出异常交给后续处理
   *
   * 正常执行后, runner会先返`CallEventLog`, 再返回`ret`
   *
   * 每次runner正确执行后都会通过`pushInverse`注册反向调用函数用户后续的回滚操作
   *
   * @param step effect信息
   * @param historyIter 日志历史
   * @param pushInverse 反向调用的注册函数
   * @param stepIndex 此次执行的步骤索引
   * @returns effect的执行结果
   * @throws CallError
   *
   */
  /* eslint-disable no-fallthrough */
  export async function* callRunner(
    step: CallEffect,
    historyIter: AsyncGenerator<EventLog>,
    pushInverse: (inverse: () => Promise<void>) => void,
    stepIndex: number,
  ): AsyncGenerator<EventLog, any> {
    const makeCallEventLog = (ret: any) =>
      callEventLog(step.effect.name, stepIndex, step.arg, ret)
    const makePrecallEventLog = () =>
      precallEventLog(step.effect.name, stepIndex)
    const makeExEventLog = (ex: any) =>
      exEventLog(step.effect.name, stepIndex, ex)

    const precall = await historyIter.next()
    let precalled = false

    if (precall.done) {
      yield makePrecallEventLog()
    } else if (
      precall.value.type === 'precall' &&
      precall.value.val.name === step.effect.name &&
      precall.value.val.stepIndex === stepIndex
    ) {
      precalled = true
    } else {
      throw new SagaCorruptedError(
        'history log error. ' +
          `history log: ${JSON.stringify(precall.value)}` +
          ` step: ${JSON.stringify(step)}, stepIndex: ${stepIndex}` +
          '. possible reason: history log is not match with current step, log is corrupted or `saga` is changed',
      )
    }

    const historyCallVal = await historyIter.next()

    if (!historyCallVal.done) {
      const hisEventLog = historyCallVal.value

      if (
        hisEventLog.type === 'call' &&
        hisEventLog.val.name === step.effect.name &&
        hisEventLog.val.stepIndex === stepIndex
      ) {
        pushInverse(() =>
          step.effect.inverse(step.arg, {
            becalled: true,
            ret: hisEventLog.val.ret,
          }),
        )
        return hisEventLog.val.ret
      }

      if (
        hisEventLog.type === 'ex' &&
        hisEventLog.val.name === step.effect.name &&
        hisEventLog.val.stepIndex === stepIndex
      ) {
        pushInverse(() =>
          step.effect.inverse(step.arg, { becalled: false, ret: undefined }),
        )
        throw hisEventLog.val.ex
      }

      if (hisEventLog.type !== 'call' && hisEventLog.type !== 'ex') {
        throw new SagaCorruptedError(
          'history log type error. expect `call` or `ex`, but got `' +
            hisEventLog.type +
            '`. possible reason: history log is not match with current step, log is corrupted or `saga` is changed',
        )
      }

      if (
        (hisEventLog.type === 'ex' || hisEventLog.type === 'call') &&
        hisEventLog.val.stepIndex !== stepIndex
      ) {
        throw new SagaCorruptedError(
          'history log stepIndex error. expect `' +
            stepIndex +
            '`, but got `' +
            hisEventLog.val.stepIndex +
            '`, possible reason: history log is not match with current step, log is corrupted or `saga` is changed',
        )
      }

      if (
        (hisEventLog.type === 'ex' || hisEventLog.type === 'call') &&
        hisEventLog.val.name !== step.effect.name
      ) {
        throw new SagaCorruptedError(
          'history log effect name error. expect `' +
            hisEventLog.val.name +
            '`, but got `' +
            step.effect.name +
            '`, possible reason: history log is not match with current step, log is corrupted or `saga` is changed',
        )
      }

      throw new SagaCorruptedError(
        `history log error: history log: ${JSON.stringify(hisEventLog)}` +
          ` step: ${JSON.stringify(step)}, stepIndex: ${stepIndex}` +
          ', possible reason: history log is not match with current step, log is corrupted or `saga` is changed',
      )
    }

    try {
      let eventLog: CallEventLog

      if (precalled) {
        const proneResult = await step.effect.probe(step.arg)

        switch (proneResult.responseCommand) {
          case 'success':
            eventLog = makeCallEventLog(proneResult.ret)
            break
          case 'inverse':
            await step.effect.inverse(step.arg, {
              becalled: false,
              ret: undefined,
            })
          case 'recall':
            eventLog = makeCallEventLog(await step.effect.call(step.arg))
            break
        }
      } else {
        eventLog = makeCallEventLog(await step.effect.call(step.arg))
      }

      pushInverse(() =>
        step.effect.inverse(step.arg, {
          becalled: true,
          ret: eventLog.val.ret,
        }),
      )

      yield eventLog
      return eventLog.val.ret
    } catch (ex: any) {
      const callError = new CallError(step.effect.name, step.arg, stepIndex, ex)

      yield makeExEventLog(callError)
      throw callError
    }
  }
}
