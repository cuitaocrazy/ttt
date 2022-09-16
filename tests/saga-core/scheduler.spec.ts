namespace saga {
  function createSagaMock(cmdType: string, callPromise: Promise<void>): Saga {
    const { callSpec } = makeCallSpec(
      'test call',
      'success',
      () => callPromise.then(() => 'effect'),
      'probe',
    )

    function* sagaEffect(payload: CmdPayload) {
      yield call(callSpec, payload)
    }

    const sagaHistory: SagaHistory = new MemorySagaHistory()

    return createSaga(
      'test saga',
      sagaEffect,
      sagaHistory,
      regularSagaLogger(() => {}),
      [],
    )
  }

  function timeoutTools(ms: number, p: Promise<any>) {
    return Promise.race([
      new Promise((resolve) => setTimeout(resolve, ms)).then(() => 'timeout'),
      p.then(() => 'ok'),
    ])
  }

  const testTimeoutMs = 1

  describe('saga管理器', () => {
    it('默认不限制saga实例个数', async () => {
      let _r: (value: void | PromiseLike<void>) => void
      const p = new Promise<void>((resolve) => { _r = resolve })
      const cmd = 'cmd1'
      const instanceCount = 1000
      const sagaMock = createSagaMock(cmd, p)
      async function * cmdIter () {
        for (let i = 0; i < instanceCount; i++) {
          yield {
            type   : cmd,
            payload: {
              id: i.toString(),
            },
          }
        }
        _r()
      }
      async function * loadIter () {
      }
      const scheduler = createSagaScheduler({ [cmd]: sagaMock }, loadIter(), cmdIter())
      scheduler.start()
      const ret = await timeoutTools(testTimeoutMs, p)
      expect(ret)
        .to.be.eq('ok')
      expect(sagaMock.getInstanceCount())
        .to.be.eq(instanceCount)
    })
    it('限制saga实例个数为2', async () => {
      let _r1: (value: void | PromiseLike<void>) => void
      let _r2: (value: void | PromiseLike<void>) => void
      const p1 = new Promise<void>((resolve) => { _r1 = resolve })
      const p2 = new Promise<void>((resolve) => { _r2 = resolve })
      const limit = 1
      const cmd1 = 'cmd1'
      const cmd2 = 'cmd2'
      const sagaMock1 = createSagaMock(cmd1, p1)
      const sagaMock2 = createSagaMock(cmd2, p2)
      async function * cmdIter () {
        yield {
          type   : cmd1,
          payload: {
            id: '1',
          },
        }
        yield {
          type   : cmd2,
          payload: {
            id: '2',
          },
        }
      }
      async function * loadIter () {
      }
      const scheduler = createSagaScheduler(
        { [cmd1]: sagaMock1, [cmd2]: sagaMock2 },
        loadIter(),
        cmdIter(),
        limit,
      )
      scheduler.start()
      await timeoutTools(testTimeoutMs, p1)
      expect(sagaMock1.getInstanceCount())
        .to.be.eq(1)
      // @ts-ignore
      _r1()
      expect(sagaMock1.getInstanceCount())
        .to.be.eq(1)
      // @ts-ignore
      _r2()
      await timeoutTools(testTimeoutMs, p2)
      expect(sagaMock2.getInstanceCount())
        .to.be.eq(0)
    })
  })
}
