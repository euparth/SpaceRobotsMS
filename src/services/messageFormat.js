export function compactMessage(value, maxArray = 8) {
  if (Array.isArray(value)) {
    if (value.length > maxArray && value.every((v) => typeof v === 'number')) {
      if (value.every((v) => v === 0)) return `‹${value.length} × 0.0›`
      return [...value.slice(0, maxArray), `‹+${value.length - maxArray} more›`]
    }
    return value.map((v) => compactMessage(v, maxArray))
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) out[key] = compactMessage(value[key], maxArray)
    return out
  }
  return value
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

export function highlightJson(json) {
  return escapeHtml(json).replace(TOKEN, (match) => {
    let cls = 'text-sky-300'
    if (match.startsWith('"')) cls = match.endsWith(':') ? 'text-slate-400' : 'text-amber-200/90'
    else if (/true|false|null/.test(match)) cls = 'text-violet-300'
    return `<span class="${cls}">${match}</span>`
  })
}
