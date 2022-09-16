namespace saga {
  describe('toObj', () => {
    it('原生Error到Obj', () => {
      // common
      let err = new Error('error')
      let obj = errorToObj(err)

      expect(obj).to.be.deep.eq({
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: undefined,
      })

      err = new RangeError('error')
      obj = errorToObj(err)

      expect(obj).to.be.deep.eq({
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: undefined,
      })

      // nested
      const cause = new Error('cause')

      err = new Error(
        'error',
        // @ts-ignore
        { cause },
      )

      obj = errorToObj(err)
      const causeJson = errorToObj(cause)

      expect(obj).to.be.deep.eq({
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: causeJson,
      })

      // cyclic
      err = new Error(
        'error_cyclic',
        // @ts-ignore
        { cause },
      )
      // @ts-ignore
      cause.cause = err
      obj = errorToObj(err)

      expect(obj).to.be.deep.eq({
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: {
          name: cause.name,
          message: cause.message,
          stack: cause.stack,
          cause: 0,
        },
      })
    })

    it('普通对象', () => {
      const errorObject = {
        err: 'err',
      }

      const obj = errorToObj(errorObject)

      expect(obj).to.be.deep.eq(errorObject)

      const errorString = 'error'
      const errorStringJson = errorToObj(errorString)

      expect(errorStringJson).to.be.deep.eq(errorString)

      const errorUndefined = undefined
      const errorUndefinedJson = errorToObj(errorUndefined)

      expect(errorUndefinedJson).to.be.deep.eq(errorUndefined)
    })

    it('CallError', () => {
      const error = new CallError('test call', 'arg', 0, 'error')
      const obj = errorToObj(error)

      expect(obj).to.be.deep.eq({
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: undefined,
      })
    })
  })

  describe('toError', () => {
    it('Obj到原生Error', () => {
      // common
      let obj: any = {
        name: 'RangeError',
        message: 'error',
        stack: 'stack',
        cause: undefined,
      }

      let error = objToError(obj)

      expect(error).to.be.instanceOf(RangeError)
      expect(errorToObj(error)).to.be.deep.eq(obj)

      // nested
      obj = {
        name: 'Error',
        message: 'error',
        stack: 'stack',
        cause: {
          name: 'RangeError',
          message: 'cause',
          stack: 'stack',
          cause: undefined,
        },
      }

      error = objToError(obj)

      expect(error).to.be.instanceOf(Error)
      expect(error.cause).to.be.instanceOf(RangeError)
      expect(errorToObj(error)).to.be.deep.eq(obj)

      // cyclic
      obj = {
        name: 'Error',
        message: 'error',
        stack: 'stack',
        cause: {
          name: 'RangeError',
          message: 'cause',
          stack: 'stack',
          cause: 0,
        },
      }

      error = objToError(obj)

      expect(error).to.be.instanceOf(Error)
      expect(error.cause).to.be.instanceOf(RangeError)
      expect(error.cause.cause).to.be.instanceOf(Error)
      expect(errorToObj(error.cause.cause)).to.be.deep.eq(errorToObj(error))
    })

    it('普通对象', () => {
      const errorObject = {
        err: 'err',
      }

      const errorObjectError = objToError(errorObject)

      expect(errorObjectError).to.be.instanceOf(Object)
      expect(errorObjectError).to.be.deep.eq(errorObject)

      const errorString = 'error'
      const errorStringError = objToError(errorString)

      expect(typeof errorStringError === 'string').to.be.true
      expect(errorStringError).to.be.deep.eq(errorString)
    })

    it('CallError', () => {
      const obj = {
        name: 'CallError',
        message: 'error',
        stack: 'stack',
        cause: undefined,
      }
      const err = objToError(obj)

      expect(err).to.be.instanceOf(CallError)
      expect(errorToObj(err)).to.be.deep.eq(obj)
    })
  })
}
