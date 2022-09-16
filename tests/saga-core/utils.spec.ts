namespace saga {
  describe('utils', () => {
    it('iterFilter', async () => {
      async function * iter () {
        yield 1
        yield 2
        yield 3
      }
    
      const newIter = iterFilter(iter(), (val) => val % 2 === 0)
      let ret = await newIter.next()
    
      expect(ret.value)
        .to.be.eq(2)
    
      ret = await newIter.next()
      expect(ret.done)
        .to.be.true
    })
    
    it('payloadEqual', () => {
      expect(payloadEqual({
        id : '123',
        amt: 1,
      }, {
        id : '123',
        amt: 1,
      }))
        .to.be.true
    
      expect(payloadEqual({
        id : '123',
        amt: 1,
      }, {
        id : '123',
        amt: 2,
      }))
        .to.be.false
    
      expect(payloadEqual({
        id: '123',
      }, {
        id : '123',
        amt: 1,
      }))
        .to.be.false
      expect(payloadEqual({
        id: '123',
        a : {
          aa: {
            aaa: 'aaa',
            aab: 'bbb',
          },
          ab: 'ab',
        },
      }, {
        id: '123',
        a : {
          aa: {
            aaa: 'aaa',
            aab: 'bbb',
          },
          ab: 'ab',
        },
      }))
        .to.be.true
    })
    
  })
}