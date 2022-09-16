namespace saga {
  describe('SagaInstance', () => {
    it('正常执行', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect',
        'probe',
      )
      const logs: EventLog[] = []
      let _r: (value: void | PromiseLike<void>) => void

      const p = new Promise((resolve) => {
        _r = resolve
      })

      const retValue = 'ret value'

      function* saga(payload: CmdPayload) {
        yield call(callSpec, payload)
        return retValue
      }

      function publishEventLog(log: EventLog) {
        logs.push(log)
        return Promise.resolve()
      }

      async function* historyIter(): AsyncGenerator<EventLog> {}

      function done(ret: any) {
        expect(ret).to.be.eq(retValue)
        _r()
      }

      const instance = createSagaInstance(
        saga({ id: 'test1' }),
        publishEventLog,
        historyIter(),
        done,
        [],
      )

      expect(instance.getStatus()).to.be.eq('running')

      await p

      expect(logs.length).to.be.eq(2)
      expect(logs[0].type).to.be.eq('precall')
      expect(logs[1].type).to.be.eq('call')
      expect(instance.getStatus()).to.be.eq('done')
    })

    it('暂停和恢复', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        () => p1,
        'probe',
      )

      const logs: EventLog[] = []

      let _r1: (value: void | PromiseLike<void>) => void

      const p1 = new Promise((resolve) => {
        _r1 = resolve
      })

      let _r2: (value: void | PromiseLike<void>) => void

      const p2 = new Promise((resolve) => {
        _r1 = resolve
      })

      function* saga(payload: CmdPayload) {
        yield call(callSpec, payload)
      }

      function publishEventLog(log: EventLog) {
        logs.push(log)
        return Promise.resolve()
      }

      async function* historyIter(): AsyncGenerator<EventLog> {}

      function done() {
        _r2()
      }

      const instance = createSagaInstance(
        saga({ id: 'test1' }),
        publishEventLog,
        historyIter(),
        done,
        [],
      )

      // @ts-ignore
      ;(async () => _r1())()

      await instance.pause()
      expect(instance.getStatus()).to.be.eq('paused')
      instance.resume()
      await p2
    })
  })
}
