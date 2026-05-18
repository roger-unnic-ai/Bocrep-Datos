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

export function useDatabase() {
  const [data, setData] = useState(() => {
    const init = {}
    Object.keys(TABLE_MAP).forEach(k => init[k] = [])
    return init
  })
  const [loading, setLoading] = useState(true)

  // Load all data on mount
  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    if (!supabase) {
      // Fallback: try localStorage
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

    const clean = rows.map(r => {
      const o = { ...r }
      delete o._id
      delete o.id
      delete o.created_at
      return o
    })

    if (!supabase) {
      // Fallback: local with generated IDs
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

  // Update a single cell
  const updateCell = useCallback(async (tableKey, rowId, field, value) => {
    // Optimistic update
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

  return { data, loading, insertRows, updateCell, deleteRow, reload: loadAll }
}
