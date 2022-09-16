namespace saga {
  /**
   * `sagaIter`的执行器
   *
   * 迭代`sagaIter`的effect, 并创建`callRunner`执行.
   * 把`callRunner`的执行结果丢给`sagaIter`作为参数获取下一个effect.
   *
   * 如果出现异常, 则迭代返回异常信息日志和回滚日志, 并迭代反向调用函数, 倒序创建`forceCallInverse`执行回滚操作.
   *
   * 历史迭代过滤器, 可以过滤掉`skip`日志. 避免扰乱溯源.
   *
   * 当发生非`CallError`异常时, 可能发生纯函数异常, 会把这种异常当做`skip`日志处理.
   *
   * @param sagaIter saga生成器
   * @param historyIter 历史记录迭代器
   * @param retryInterval 重试间隔
   * @returns
   */
  export async function* sagaRunner(
    sagaIter: SagaGenerator,
    historyIter: AsyncGenerator<EventLog>,
    // retryInterval: number[] = [100, 500, 1000, 2000, 5000, 10000],
    retryInterval: number[],
  ) {
    const inverses: Inverse[] = []
    let stepIndex = 0
    let ret: any

    historyIter = iterFilter(historyIter, (log) => log.type !== 'skip')

    const putInverse =
      (effectWrapper: EffectWrapper) => (inverse: () => Promise<void>) =>
        inverses.push({
          name: effectWrapper.effect.name,
          stepIndex,
          inverse,
        })

    try {
      while (true) {
        let sagaStep: IteratorResult<EffectWrapper, any>

        try {
          sagaStep = await sagaIter.next(ret)
        } catch (ex) {
          throw new SagaRunnerError(ex)
        }

        if (sagaStep.done) {
          return sagaStep.value
        }

        const step = sagaStep.value

        if (isCallEffect(step)) {
          ret = yield* callRunner(
            step,
            historyIter,
            putInverse(step),
            stepIndex,
          )
        } else {
          throw new SagaRunnerError(
            `Unexpected effect json: ${JSON.stringify(step)}`,
          )
        }

        stepIndex++
      }
    } catch (ex: any) {
      if (!(ex instanceof CallError)) {
        yield skipExEventLog(stepIndex, ex)
      }

      const log = await historyIter.next()

      if (log.done) {
        yield rollbackEventLog(
          inverses.map((inverse) => inverse.stepIndex),
          ex,
        )
      }

      for (const inverse of inverses.reverse()) {
        yield* forceCallInverse(inverse, historyIter, retryInterval)
      }
    }
  }
}
