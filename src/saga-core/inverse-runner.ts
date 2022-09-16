namespace saga {
  /**
   * 反向调用函数信息
   */
  export type Inverse = {
    name: string
    stepIndex: number
    inverse: () => Promise<void>
  }

  /**
   * 当出现回滚时, 需要反向调用函数. 则通过此runner执行.
   * 此runner必须执行成功, 如果需要停止则由外部控制.
   *
   * 如果`retryInterval`为空, 则无延迟重试, 否则按给定的数组执行延迟操作.
   * 如果重试次数超过`retryInterval`的长度, 则按最后一个元素设定的延迟间隔一直执行下去.
   *
   * 当有历史日志时, 则溯源函数的执行历史, 不执行`inverse`, 直到溯源结束, 在正常执行.
   *
   * 如果执行`inverse`有异常则迭代返回异常信息日志后继续执行. 如果执行成功则返回`inverse`日志结束runner的运行.
   *
   * @param inverse 反调信息
   * @param historyIter 日志历史
   * @param retryInterval 重试间隔, 单位毫秒
   * @returns
   */
  export async function* forceCallInverse(
    inverse: Inverse,
    historyIter: AsyncGenerator<EventLog>,
    retryInterval: number[] = [],
  ): AsyncGenerator<EventLog, void> {
    let retryTimes = 0

    while (true) {
      if (retryTimes > 0 && retryInterval.length > 0) {
        if (retryTimes < retryInterval.length) {
          await delay(retryInterval[retryTimes])
        } else {
          await delay(retryInterval[retryInterval.length - 1])
        }
      }

      const historyStepLog = await historyIter.next()

      if (historyStepLog.done) {
        try {
          await inverse.inverse()

          yield inverseEventLog(inverse.name, inverse.stepIndex)
          return
        } catch (ex) {
          retryTimes++
          yield exEventLog(
            inverse.name,
            inverse.stepIndex,
            new InverseError(inverse.name, inverse.stepIndex, ex),
          )
        }
      } else {
        if (historyStepLog.value.type === 'inverse') {
          return
        } else {
          retryTimes++
        }
      }
    }
  }
}
