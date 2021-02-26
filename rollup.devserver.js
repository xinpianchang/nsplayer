import serve from 'rollup-plugin-serve'

const PORT = Number(process.env.PORT || 5000)

export default () => {
  return serve({
    open: true,
    openPage: `http://nsplayer.local.vmovier.cc:${PORT}/samples/index.html`,
    contentBase: '.',
    port: PORT,
    mimeTypes: {
      'text/html; charset=utf8': ['html'],
    },
  })
}
