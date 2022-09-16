namespace saga {
  describe('forceCallInverse', () => {
    it('一直call到成功', async () => {
      const err = new Error('error')

      function twoCallLastSuccess() {
        let count = 0

        return function () {
          if (count++ === 1) {
            return Promise.resolve()
          } else {
            return Promise.reject(err)
          }
        }
      }
      const inverse = {
        name: 'test inverse',
        stepIndex: 0,
        inverse: twoCallLastSuccess(),
      }

      async function* historyIter(): AsyncGenerator<EventLog> {}

      const iter = forceCallInverse(inverse, historyIter())

      let log = await iter.next()

      const inverseError = (log as any).value.val.ex as InverseError

      expect(log.value).to.be.deep.eq({
        type: 'ex',
        val: { ex: inverseError, stepIndex: 0, name: 'test inverse' },
      })
      log = await iter.next()

      expect(inverseError).to.be.instanceOf(InverseError)
      expect(inverseError.message).to.be.eq(
        'name: "test inverse", stepIndex: 0, err: ["error"]',
      )

      expect(log.value).to.be.deep.eq({
        type: 'inverse',
        val: { name: 'test inverse', stepIndex: 0 },
      })

      log = await iter.next()
      expect(log.done).to.be.true
    })

    it('可回溯历史', async () => {
      async function* historyIter(): AsyncGenerator<EventLog> {
        yield exEventLog('test inverse', 0, 'error1')
        yield inverseEventLog('test inverse', 0)
      }

      const fn = sinon.fake()
      const iter = forceCallInverse(
        { name: 'test inverse', stepIndex: 0, inverse: fn },
        historyIter(),
      )

      const log = await iter.next()

      expect(log.done).to.be.true
      expect(fn.called).to.be.false
    })

    it('回溯加调用', async () => {
      const fn = sinon.fake()

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield exEventLog('test inverse', 0, 'error1')
      }
      const iter = forceCallInverse(
        { name: 'test inverse', stepIndex: 0, inverse: fn },
        historyIter(),
      )
      const log = await iter.next()

      expect(log.value!.type).to.be.eq('inverse')
      expect(fn.calledOnce).to.be.true
    })
  })
}
