import { useEffect, useMemo, useState } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function useEntitlement() {
  const [token, setToken] = useState(() => localStorage.getItem('entitlement_token') || '')
  const [plan, setPlan] = useState(() => localStorage.getItem('entitlement_plan') || 'free')
  const [expiresAt, setExpiresAt] = useState(() => Number(localStorage.getItem('entitlement_expires') || 0))

  useEffect(() => {
    const now = Math.floor(Date.now()/1000)
    if (token && expiresAt && expiresAt < now) {
      setPlan('free')
    }
  }, [token, expiresAt])

  const save = (t, p, e) => {
    setToken(t)
    setPlan(p)
    setExpiresAt(e)
    localStorage.setItem('entitlement_token', t)
    localStorage.setItem('entitlement_plan', p)
    localStorage.setItem('entitlement_expires', String(e))
  }

  const refresh = async () => {
    if (!token) return
    try {
      const res = await fetch(`${BACKEND}/api/entitlement/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitlement_token: token })
      })
      if (res.ok) {
        const data = await res.json()
        save(data.entitlement_token, data.plan, data.expires_at)
      }
    } catch (_) {}
  }

  return { token, plan, expiresAt, save, refresh }
}

function Pricing({ onSelect }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="border rounded-xl p-5 bg-white">
        <h3 className="text-xl font-semibold">Free</h3>
        <ul className="mt-3 text-sm text-gray-600 list-disc pl-5 space-y-1">
          <li>Basic metric conversions (length: mm/cm/m/km)</li>
          <li>Basic mass conversions (mg/g/kg)</li>
          <li>Temperature (C/F/K)</li>
        </ul>
        <button onClick={() => onSelect('free')} className="mt-4 w-full bg-gray-800 text-white py-2 rounded-lg">Use Free</button>
      </div>
      <div className="border rounded-xl p-5 bg-gradient-to-br from-amber-50 to-rose-50">
        <h3 className="text-xl font-semibold">Pro</h3>
        <p className="text-sm text-gray-700">$3/month or $30/year</p>
        <ul className="mt-3 text-sm text-gray-600 list-disc pl-5 space-y-1">
          <li>Imperial conversions (in/ft/yd/mi)</li>
          <li>Area, Volume and Time conversions</li>
          <li>Ounces, pounds, tons and more</li>
        </ul>
        <button onClick={() => onSelect('pro')} className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg">Get Pro</button>
      </div>
    </div>
  )
}

function Converter({ entitlement }) {
  const [value, setValue] = useState(1)
  const [from, setFrom] = useState('m')
  const [to, setTo] = useState('cm')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const pro = entitlement.plan === 'pro'

  const units = useMemo(() => ({
    length: [ 'mm','cm','m','km', ...(pro ? ['in','ft','yd','mi','nm','um'] : []) ],
    weight: [ 'mg','g','kg', ...(pro ? ['oz','lb','ton'] : []) ],
    temperature: ['C','F','K'],
    area: pro ? ['cm2','m2','km2','ft2','acre'] : [],
    volume: pro ? ['ml','l','m3','ft3','gal'] : [],
    time: pro ? ['ms','s','min','h','day'] : [],
  }), [pro])

  const allUnits = useMemo(() => Array.from(new Set([
    ...units.length, ...units.weight, ...units.temperature, ...units.area, ...units.volume, ...units.time
  ])), [units])

  const convert = async ()
  => {
    setError('')
    setResult(null)
    try {
      const res = await fetch(`${BACKEND}/api/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(entitlement.token ? { Authorization: `Bearer ${entitlement.token}` } : {})
        },
        body: JSON.stringify({ value: Number(value), from_unit: from, to_unit: to })
      })
      if (res.status === 402) {
        setError('Pro required for this conversion. Please upgrade to continue.')
        return
      }
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Conversion failed')
      }
      const data = await res.json()
      setResult(data.result)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    const now = Math.floor(Date.now()/1000)
    if (entitlement.expiresAt && entitlement.expiresAt - now < 3600) {
      entitlement.refresh()
    }
  }, [])

  return (
    <div className="bg-white rounded-xl p-6 shadow">
      <div className="grid sm:grid-cols-3 gap-3">
        <input type="number" value={value} onChange={e=>setValue(e.target.value)} className="border rounded px-3 py-2" />
        <select value={from} onChange={e=>setFrom(e.target.value)} className="border rounded px-3 py-2">
          {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={to} onChange={e=>setTo(e.target.value)} className="border rounded px-3 py-2">
          {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <button onClick={convert} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded">Convert</button>
      {result !== null && (
        <p className="mt-4 text-lg font-semibold">Result: {result}</p>
      )}
      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
      {!pro && (
        <p className="mt-3 text-sm text-gray-600">Tip: Try converting in↔cm or mi↔km after upgrading to Pro.</p>
      )}
    </div>
  )
}

function Settings({ entitlement }) {
  const [license, setLicense] = useState('')
  const [message, setMessage] = useState('')

  const verify = async () => {
    setMessage('')
    try {
      const res = await fetch(`${BACKEND}/api/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: license })
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Verification failed')
      }
      const data = await res.json()
      entitlement.save(data.entitlement_token, data.plan, data.expires_at)
      setMessage('License verified. Pro enabled!')
      setLicense('')
    } catch (e) {
      setMessage(e.message)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow space-y-3">
      <h3 className="text-lg font-semibold">License</h3>
      <input value={license} onChange={e=>setLicense(e.target.value)} placeholder="Enter license key" className="w-full border rounded px-3 py-2" />
      <button onClick={verify} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded">Verify License</button>
      {message && <p className="text-sm">{message}</p>}
      <div className="pt-2 text-xs text-gray-600">
        <p>Your status: <span className="font-semibold uppercase">{entitlement.plan}</span>{entitlement.plan==='pro' && entitlement.expiresAt ? ` (renews by ${new Date(entitlement.expiresAt*1000).toLocaleString()})` : ''}</p>
      </div>
    </div>
  )
}

function Checkout() {
  const [plan, setPlan] = useState('monthly')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const createCheckout = async () => {
    setError('')
    setUrl('')
    try {
      const res = await fetch(`${BACKEND}/api/checkout/create?plan=${plan}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Checkout creation failed')
      setUrl(data.checkout_url)
      window.open(data.checkout_url, '_blank')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow space-y-3">
      <h3 className="text-lg font-semibold">Upgrade to Pro</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={`border rounded p-3 ${plan==='monthly'?'ring-2 ring-amber-500':''}`}>
          <input type="radio" name="plan" value="monthly" checked={plan==='monthly'} onChange={()=>setPlan('monthly')} />
          <span className="ml-2">Monthly - $3</span>
        </label>
        <label className={`border rounded p-3 ${plan==='yearly'?'ring-2 ring-amber-500':''}`}>
          <input type="radio" name="plan" value="yearly" checked={plan==='yearly'} onChange={()=>setPlan('yearly')} />
          <span className="ml-2">Yearly - $30</span>
        </label>
      </div>
      <button onClick={createCheckout} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2 rounded">Proceed to Checkout</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {url && <p className="text-sm text-gray-700 break-all">Checkout: <a href={url} className="text-blue-600 underline" target="_blank">{url}</a></p>}
    </div>
  )
}

function App() {
  const entitlement = useEntitlement()

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-sky-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Toolkit Converter</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${entitlement.plan==='pro'?'bg-emerald-100 text-emerald-700':'bg-gray-200 text-gray-700'}`}>{entitlement.plan.toUpperCase()}</span>
        </header>

        <Pricing onSelect={(plan)=> plan==='pro' ? null : null} />

        <Converter entitlement={entitlement} />

        <div className="grid sm:grid-cols-2 gap-6">
          <Checkout />
          <Settings entitlement={entitlement} />
        </div>

        <footer className="text-center text-xs text-gray-500 pt-4">Dodo Payments for checkout. Prices: $3/month, $30/year.</footer>
      </div>
    </div>
  )
}

export default App
