namespace saga {
  export type SagaInstanceStatus = 'running' | 'paused' | 'done' | 'closed'

  /**
   * Saga实例
   */
  export interface SagaInstance {
    pause(): Promise<void>
    resume(): void
    getStatus(): SagaInstanceStatus
    close(): Promise<void>
  }

  /**
   * 创建`SagaInstance`
   *
   * `loop`函数负责的事情:
   * 1. 创建`sagaRunner`, 并迭代它直至完毕
   * 2. 把runner的执行日志通过`publishEventLog`发布出去
   * 3. `loop`结束调用`done`函数, 通知SagaRunner结束
   *
   * `SagaInstance`是一个实例操作handler, 可暂停, 恢复和关闭runner, 可获取实例的启停状态
   *
   * @param sagaIter saga生成器
   * @param publishEventLog 日志发布函数
   * @param historyIter 历史记录迭代器
   * @param done 完成回调
   * @param retryInterval 重试间隔
   * @returns Saga实例
   */
  export function createSagaInstance(
    sagaIter: SagaGenerator,
    publishEventLog: (log: EventLog) => Promise<void>,
    historyIter: AsyncGenerator<EventLog>,
    done: (ret?: any) => void,
    retryInterval: number[],
  ): SagaInstance {
    let pauseResolve: (() => void) | null = null
    let resumeResolve: (() => void) | null = null
    let resumePromise: Promise<void> | null = null
    let pausePromise: Promise<void> | null = null
    let status: SagaInstanceStatus = 'running'

    const loop = async () => {
      const runnerIter = sagaRunner(sagaIter, historyIter, retryInterval)

      while (true) {
        if (pauseResolve) {
          status = 'paused'
          pauseResolve()
          await resumePromise

          pausePromise = null
          pauseResolve = null
          resumePromise = null
          resumeResolve = null

          // @ts-ignore
          if (status === 'closed') {
            return
          }

          status = 'running'
        }
        const ret = await runnerIter.next()

        if (ret.done === true) {
          return ret.value
        } else {
          await publishEventLog(ret.value)
        }
      }
    }

    async function pause() {
      if (status === 'closed' || status === 'done') {
        return
      }

      // prevent multiple pause
      if (!pausePromise) {
        resumePromise = new Promise((resolve) => {
          resumeResolve = resolve
        })
        pausePromise = new Promise<void>((resolve) => {
          pauseResolve = resolve
        })
      }

      return pausePromise
    }

    function resume() {
      if (resumeResolve) {
        resumeResolve()
      }
    }

    async function close() {
      if (status === 'closed' || status === 'done') {
        return
      }

      await pause()
      status = 'closed'
      resume()
    }

    const instance: SagaInstance = {
      pause,
      resume,
      getStatus: () => status,
      close,
    }

    loop().then((ret?: any) => {
      status = 'done'
      done(ret)
    })

    return instance
  }
}
