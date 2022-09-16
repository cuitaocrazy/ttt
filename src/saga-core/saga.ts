namespace saga {
  export type SagaInstanceMap = {
    [key: string]: {
      createTime: Date
      instance: SagaInstance
      payload: CmdPayload
      wait: Promise<any>
    }
  }

  export interface Saga {
    run(initPayload: CmdPayload): Promise<{ wait: Promise<any> }>
    load(id?: string | SagaInfo): Promise<void>
    existsInstance(id: string): boolean
    getInstances(): SagaInstanceMap
    getDoneTimes: () => number
    getRollbackTimes: () => number
    getInstanceCount: () => number
    getRepo: () => SagaHistory
    registoryInstanceDoneCallback: (
      callback: (sagaName: string, id: string) => void,
    ) => () => void
  }

  function eraseSystemCatch(promise: Promise<any>) {
    promise.catch(() => {})
    return promise
  }

  /**
   * 负责创建Saga
   *
   * 两个重要的函数:
   * 1. run: 运行Saga实例
   * 2. load: 从SagaHistory中加载并继续运行Saga实例
   *
   * `run`返回`{wait: Promise<any>}`. 不直接返回`Promise<any>`的原因是避免调用方用await解开这个Promise.
   * 例如: `const v = await Promise.resolve(Promise.resolve(1))`, 对于javascript来说`v`是`1`而不是`Promise<number>`.
   * 这个Promise是Saga实例的返回值. 当SagaRunner执行异常时, 会将异常错误抛出.
   * 当抛出异常时Promise就完成, 但不意味之SagaRunner结束, 它可能仍在执行回滚操作. 只是让调用方提前知道错误可做后续处理.
   * 因为这个回滚可能执行很长时间的操作, 甚至永远不结束.
   *
   * 当调用`load`时也会产生这个Promise, 但不会返回, 它对load的调用者没有意义.
   *
   * 如果想得到某个实例的Promise, 可以通过`getInstances()`函数获取实例Map, 通过`id`和`wait`属性可以获得这个Promise
   *
   * @param name saga name
   * @param effectSaga effect的generator函数
   * @param repo 资料库
   * @param logger 日志
   * @param retryInterval 重试间隔
   * @returns Saga
   */
  export function createSaga(
    name: string,
    effectSaga: (payload: CmdPayload) => SagaGenerator,
    repo: SagaHistory,
    logger: RegularSagaLogger,
    retryInterval: number[],
  ): Saga {
    const instances: SagaInstanceMap = {}
    let doneTimes = 0
    let rollbackTimes = 0
    const cbs: ((sagaName: string, id: string) => void)[] = []

    function createInstance(sagaInfo: SagaInfo) {
      let _resolve: (value: any) => void = () => {}
      let _reject: (reason?: any) => void = () => {}
      const wait =
        sagaInfo.status === 'rollbacking'
          ? Promise.reject(sagaInfo.ret)
          : new Promise((resolve, reject) => {
              _resolve = resolve
              _reject = reject
            })

      const publishEventLog: (log: EventLog) => Promise<void> = async (log) => {
        if (log.type === 'rollback') {
          rollbackTimes++
          await repo.rollback(name, sagaInfo.id, log.val.ex)
          // 回滚后, 不在等待回滚操作完成, 直接结束
          _reject(log.val.ex)
        }

        if (log.type !== 'skip') {
          await repo.saveEventLog(name, sagaInfo.id, log)
        } else if (
          log.val.type === 'err' &&
          log.val.val instanceof SagaCorruptedError
        ) {
          delete instances[sagaInfo.id]
          sagaInstance
            .close()
            .then(() => repo.discardDamagedSaga(name, sagaInfo.id))
        }

        logger(name, sagaInfo.id, log)
      }

      const historyIter = repo.getEventLogs(name, sagaInfo.id)

      const done = (ret?: any) => {
        delete instances[sagaInfo.id]
        doneTimes++
        repo.done(name, sagaInfo.id, ret).then(() => {
          // 当rollback后, 由于先调用reject, 所以这里的resolve调用不会影响Promise的结果
          _resolve(ret)

          logger(name, sagaInfo.id, {
            type: 'done',
            duration: Date.now() - sagaInfo.createTime.getTime() || 1,
          })

          for (const cb of cbs) {
            cb(name, sagaInfo.id)
          }
        })
      }

      const sagaInstance = createSagaInstance(
        effectSaga(sagaInfo.payload),
        publishEventLog,
        historyIter,
        done,
        retryInterval,
      )

      instances[sagaInfo.id] = {
        createTime: sagaInfo.createTime,
        instance: sagaInstance,
        payload: sagaInfo.payload,
        wait: eraseSystemCatch(wait),
      }
    }

    async function run(initPayload: CmdPayload) {
      const id = repo.getSagaId(name, initPayload)

      if (instances[id]) {
        const oldPayload = instances[id].payload

        if (payloadEqual(oldPayload, initPayload)) {
          return { wait: instances[id].wait }
        } else {
          const ex = new PayloadMismatchError(name, id, oldPayload, initPayload)

          logger(name, id, {
            type: 'error',
            error: ex,
          })

          return { wait: eraseSystemCatch(Promise.reject(ex)) }
        }
      }

      let info = await repo.getSagaInfo(name, id)

      if (!info) {
        info = await repo.saveSagaInfo(name, id, initPayload)
      } else if (!payloadEqual(info.payload, initPayload)) {
        const ex = new PayloadMismatchError(name, id, info.payload, initPayload)

        logger(name, id, {
          type: 'error',
          error: ex,
        })

        return { wait: eraseSystemCatch(Promise.reject(ex)) }
      }

      if (info.status === 'done') {
        if (info.retStatus === 'success') {
          return { wait: Promise.resolve(info.ret) }
        } else {
          return { wait: eraseSystemCatch(Promise.reject(info.ret)) }
        }
      }

      createInstance(info)

      return { wait: instances[id].wait }
    }

    async function aloneLoad(id: string | SagaInfo) {
      let info: SagaInfo

      if (typeof id === 'string') {
        if (instances[id]) {
          return
        }
        const ret = await repo.getSagaInfo(name, id)

        if (!ret) {
          logger(name, id, {
            type: 'error',
            error: `Saga ${name} with id ${id} not exist.`,
          })
          return
        }

        info = ret
      } else {
        info = id
      }

      if (info.status === 'done') {
        for (const cb of cbs) {
          cb(name, info.id)
        }
        return
      }

      createInstance(info)
    }

    async function load(id?: string | SagaInfo) {
      id
        ? await aloneLoad(id)
        : await repo.getAllIds(name).then(async (ids) => {
            for (const id of ids) {
              await aloneLoad(id)
            }
          })
    }

    function registoryInstanceDoneCallback(
      callback: (sagaName: string, id: string) => void,
    ) {
      cbs.push(callback)
      return () => {
        const index = cbs.indexOf(callback)

        if (index > -1) {
          cbs.splice(index, 1)
        }
      }
    }

    const saga = {
      run,
      load,
      getDoneTimes: () => doneTimes,
      getRollbackTimes: () => rollbackTimes,
      getInstances: () => ({ ...instances }),
      getInstanceCount: () => Object.keys(instances).length,
      registoryInstanceDoneCallback,
      existsInstance: (id: string) => !!instances[id],
      getRepo: () => repo,
    }

    return saga
  }
}
