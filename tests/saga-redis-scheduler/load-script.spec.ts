namespace saga {
  const { expect }: typeof import('chai') = require('chai')
  const Redis: typeof import('ioredis').default = require('ioredis').default
  type Redis = import('ioredis').default
  const RedisMemoryServer: typeof import('redis-memory-server').RedisMemoryServer = require('redis-memory-server').RedisMemoryServer
  type RedisMemoryServer = import('redis-memory-server').RedisMemoryServer

  describe('load script test', async () => {
    let host: string
    let port: number
    let server: RedisMemoryServer
    let clients: Redis[] = []

    before(async () => {
      server = new RedisMemoryServer()
      host = await server.getHost()
      port = await server.getPort()
    })

    after(async () => {
      for(let client of clients) {
        if(client.status === 'ready') {
          await client.quit()
        }
      }
      await server.stop()
    })

    function createClient() {
      const client = new Redis(port, host)
      client.on('error', (err) => {
        console.error(err)
      })

      clients.push(client)
      return client
    }

    it('load-script', async () => {
      const prefix = '{scheduler}:'
      const nodeKeys = ['n1', 'n2', 'n3', 'n4', 'n5']
      const client = createClient()
      const channels = nodeKeys.map((key) => createClient())

      const locks = nodeKeys.reduce((s, e) => {
        // @ts-ignore
        s[e] = createPromiseLock()
        return s
      }, {})

      await Promise.all(
        channels.map(async (channel, i) => {
          // await channel.connect()
          await channel.subscribe(prefix + nodeKeys[i])
          channel.on('message', (channel, msg) => {
            // @ts-ignore
            locks[nodeKeys[i]].resolve([i, JSON.parse(msg).length])
          })
        }),
      )

      // await client.connect()

      const keys: string[] = []
      const ai = 'a'.charCodeAt(0)

      for (let i = 0; i < 26; i++) {
        keys.push(String.fromCharCode(ai + i))
      }

      await client.sadd(prefix + 'all', keys)

      const nodeSetCount = [1, 4, 2, 0, 3]
      let index = 0

      for (let i = 0; i < nodeKeys.length; i++) {
        const count = nodeSetCount[i]
        const nodeKey = prefix + nodeKeys[i]

        const nks: string[] = []

        for (let j = 0; j < count; j++) {
          nks.push(String.fromCharCode(ai + index))
          index++
        }

        if (nks.length > 0) {
          await client.sadd(nodeKey, nks)
        }
      }

      const triggerLoad = makeTriggerLoad(client, 100)

      triggerLoad()

      const as: [number, number][] = await Promise.all(
        Object.values(locks).map((lock) => (lock as any).promise),
      )

      const loadCount = 26 - nodeSetCount.reduce((s, e) => s + e)

      expect(loadCount).to.be.eq(as.reduce((s, e) => s + e[1], 0))

      const min = Math.floor(26 / nodeKeys.length)
      const max = Math.ceil(26 / nodeKeys.length)

      as.forEach((a) => {
        const currentCount = a[1] + nodeSetCount[a[0]]

        expect(currentCount >= min && currentCount <= max).to.be.true
      })
    })
  })
}
