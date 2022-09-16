namespace saga {
  describe('channel', async () => {
    it('test', async () => {
      const { put, iter } = createChannel()

      const p1 = put({ type: 'test', payload: { id: '1' } })
      const p2 = put({ type: 'test', payload: { id: '2' } })
      const p3 = put({ type: 'test', payload: { id: '3' } })

      expect((await iter.next()).value).to.be.deep.eq({
        type: 'test',
        payload: { id: '1' },
      })
      expect((await iter.next(1)).value).to.be.deep.eq({
        type: 'test',
        payload: { id: '2' },
      })
      expect(await p1).to.be.eq(1)
      expect((await iter.next(Promise.resolve(2))).value).to.be.deep.eq({
        type: 'test',
        payload: { id: '3' },
      })
      expect(await p2).to.be.eq(2)

      // eslint-disable-next-line prefer-promise-reject-errors
      iter.next(Promise.reject('err'))

      try {
        await p3
        throw new Error('should not reach here')
      } catch (e) {
        expect(e).to.be.eq('err')
      }
    })
  })
}
