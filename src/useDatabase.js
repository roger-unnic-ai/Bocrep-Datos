import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const TABLE_MAP = {
  productes: 'productes',
  recepta: 'recepta',
  farcit: 'farcit',
  linies: 'linies',
  flux: 'flux',
  torns: 'torns',
}

// Fields that must never be sent to the DB
const META_FIELDS = ['_id', 'id', 'created_at', '_action', '_existingId']
const cleanRow = r => {
  const o = { ...r }
  META_FIELDS.forEach(f => delete o[f])
  return o
}

export function useDatabase() {
  const [data, setData] = useState(() => {
    const init = {}
    Object.keys(TABLE_MAP).forEach(k => init[k] = [])
    return init
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    if (!supabase) {
      try {
        const saved = localStorage.getItem('produccio_data')
        if (saved) setData(JSON.parse(saved))
      } catch {}
      setLoading(false)
      return
    }

    const newData = {}
    for (const [key, table] of Object.entries(TABLE_MAP)) {
      const { data: rows, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        console.error(`Error loading ${table}:`, error)
        newData[key] = []
      } else {
        newData[key] = rows || []
      }
    }
    setData(newData)
    setLoading(false)
  }

  // Insert rows into a specific table
  const insertRows = useCallback(async (tableKey, rows) => {
    if (!rows.length) return []

    const clean = rows.map(cleanRow)

    if (!supabase) {
      const withIds = clean.map((r, i) => ({ ...r, id: `local-${Date.now()}-${i}` }))
      setData(prev => {
        const next = { ...prev, [tableKey]: [...prev[tableKey], ...withIds] }
        try { localStorage.setItem('produccio_data', JSON.stringify(next)) } catch {}
        return next
      })
      return withIds
    }

    const { data: inserted, error } = await supabase
      .from(TABLE_MAP[tableKey])
      .insert(clean)
      .select()

    if (error) {
      console.error(`Insert error (${tableKey}):`, error)
      return []
    }

    setData(prev => ({
      ...prev,
      [tableKey]: [...prev[tableKey], ...inserted],
    }))
    return inserted
  }, [])

  // Merge new data into an existing row — only fills fields that are currently empty/null
  const mergeRow = useCallback(async (tableKey, rowId, newData) => {
    const existing = data[tableKey]?.find(r => r.id === rowId)
    if (!existing) return null

    const updates = {}
    Object.entries(newData).forEach(([k, v]) => {
      if (META_FIELDS.includes(k)) return
      const cur = existing[k]
      const isEmpty = cur === null || cur === undefined || cur === ''
      const hasVal = v !== null && v !== undefined && v !== ''
      if (isEmpty && hasVal) updates[k] = v
    })

    if (!Object.keys(updates).length) return existing // nothing new to fill in

    const merged = { ...existing, ...updates }

    setData(prev => {
      const next = {
        ...prev,
        [tableKey]: prev[tableKey].map(r => r.id === rowId ? merged : r),
      }
      if (!supabase) {
        try { localStorage.setItem('produccio_data', JSON.stringify(next)) } catch {}
      }
      return next
    })

    if (supabase) {
      const { error } = await supabase
        .from(TABLE_MAP[tableKey])
        .update(updates)
        .eq('id', rowId)
      if (error) {
        console.error(`Merge error (${tableKey}):`, error)
        return null
      }
    }

    return merged
  }, [data])

  // Update a single cell
  const updateCell = useCallback(async (tableKey, rowId, field, value) => {
    setData(prev => {
      const rows = prev[tableKey].map(r =>
        (r.id === rowId) ? { ...r, [field]: value } : r
      )
      const next = { ...prev, [tableKey]: rows }
      if (!supabase) {
        try { localStorage.setItem('produccio_data', JSON.stringify(next)) } catch {}
      }
      return next
    })

    if (supabase) {
      const { error } = await supabase
        .from(TABLE_MAP[tableKey])
        .update({ [field]: value })
        .eq('id', rowId)

      if (error) console.error(`Update error:`, error)
    }
  }, [])

  // Delete a row
  const deleteRow = useCallback(async (tableKey, rowId) => {
    setData(prev => {
      const next = { ...prev, [tableKey]: prev[tableKey].filter(r => r.id !== rowId) }
      if (!supabase) {
        try { localStorage.setItem('produccio_data', JSON.stringify(next)) } catch {}
      }
      return next
    })

    if (supabase) {
      const { error } = await supabase
        .from(TABLE_MAP[tableKey])
        .delete()
        .eq('id', rowId)

      if (error) console.error(`Delete error:`, error)
    }
  }, [])

  return { data, loading, insertRows, mergeRow, updateCell, deleteRow, reload: loadAll }
}
