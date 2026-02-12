import React, { useEffect, useState } from 'react'
import './App.css'
import logoAguiar from './assets/logo-aguiar-moderna.png'
import { dataService, type Product, type LayoutConfig } from './services/dataService'
import { isMobile } from './utils/platform'

const API_BASE = 'https://aguiar-production.up.railway.app'

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    image: null as File | null,
    category: '',
    sku: '',
    promotional: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [filters, setFilters] = useState({
    category: '',
    onlyPromotional: false,
    orderBy: 'createdDesc' as 'createdDesc' | 'priceAsc' | 'priceDesc' | 'nameAsc',
  })
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [previewProducts, setPreviewProducts] = useState<Product[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    loadProducts()
    loadLayoutConfig()
  }, [])

  async function loadProducts() {
    try {
      setLoading(true)
      const data = await dataService.getProducts({
        category: filters.category || undefined,
        onlyPromotional: filters.onlyPromotional || undefined,
        orderBy: filters.orderBy !== 'createdDesc' ? filters.orderBy : undefined,
      })
      setProducts(data)
    } catch (e) {
      setError('Erro ao carregar produtos.')
    } finally {
      setLoading(false)
    }
  }

  async function loadLayoutConfig() {
    try {
      const data = await dataService.getLayoutConfig()
      setLayoutConfig(data)
    } catch {
      // silencioso; usa defaults
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setForm((prev) => ({ ...prev, image: file }))
  }

  function handleBooleanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: checked }))
  }

  function resetForm() {
    setEditingId(null)
    setForm({
      name: '',
      description: '',
      price: '',
      image: null,
      category: '',
      sku: '',
      promotional: false,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name || !form.price) {
      setError('Nome e valor são obrigatórios.')
      return
    }

    try {
      setSaving(true)
      
      // No mobile, salvar imagem como base64 no localStorage
      // No web, usar FormData normal
      if (isMobile() && form.image) {
        // Converter imagem para base64 no mobile
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64Image = reader.result as string
          const productData = {
            name: form.name,
            description: form.description,
            price: form.price,
            category: form.category,
            sku: form.sku || '',
            promotional: form.promotional,
            imageUrl: base64Image,
          }
          
          if (editingId) {
            await dataService.updateProduct(editingId, productData)
          } else {
            await dataService.createProduct(productData)
          }
          
          await loadProducts()
          resetForm()
          setSaving(false)
        }
        reader.readAsDataURL(form.image)
        return
      }

      // Versão web - usar FormData
      if (!isMobile()) {
        const formData = new FormData()
        formData.append('name', form.name)
        formData.append('description', form.description)
        formData.append('price', form.price)
        formData.append('category', form.category)
        formData.append('sku', form.sku)
        formData.append('promotional', String(form.promotional))
        if (form.image) {
          formData.append('image', form.image)
        }

        const url = editingId
          ? `${API_BASE}/products/${editingId}`
          : `${API_BASE}/products`
        const method = editingId ? 'PUT' : 'POST'

        const res = await fetch(url, {
          method,
          body: formData,
        })

        if (!res.ok) {
          throw new Error('Erro ao salvar produto.')
        }
      } else {
        // Mobile sem imagem
        const productData = {
          name: form.name,
          description: form.description,
          price: form.price,
          category: form.category,
          sku: form.sku || '',
          promotional: form.promotional,
          imageUrl: null,
        }
        
        if (editingId) {
          await dataService.updateProduct(editingId, productData)
        } else {
          await dataService.createProduct(productData)
        }
      }

      await loadProducts()
      resetForm()
    } catch (e) {
      setError('Erro ao salvar produto.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      image: null,
      category: product.category ?? '',
      sku: product.sku ?? '',
      promotional: !!product.promotional,
    })
  }

  async function handleDelete(id: number) {
    if (!confirm('Deseja realmente excluir este produto?')) return
    setError(null)
    try {
      await dataService.deleteProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Erro ao excluir produto.')
    }
  }

  async function handlePreviewPdf() {
    try {
      const filteredProducts = await dataService.getProducts({
        category: filters.category || undefined,
        onlyPromotional: filters.onlyPromotional || undefined,
        orderBy: filters.orderBy !== 'createdDesc' ? filters.orderBy : undefined,
      })
      setPreviewProducts(filteredProducts)
      setShowPdfPreview(true)
    } catch (e) {
      setError('Erro ao carregar preview do PDF.')
    }
  }

  function handleGeneratePdf() {
    // Passar a ordem customizada dos produtos
    const productIds = previewProducts.map((p) => p.id).join(',')
    const params = new URLSearchParams()
    if (filters.category) params.set('category', filters.category)
    if (filters.onlyPromotional) params.set('onlyPromotional', 'true')
    if (filters.orderBy !== 'createdDesc') params.set('orderBy', filters.orderBy)
    if (productIds) params.set('productIds', productIds) // Ordem customizada
    
    const url = `${API_BASE}/catalog/pdf?${params.toString()}`
    
    if (isMobile()) {
      alert('Geração de PDF no mobile será implementada em breve. Por enquanto, use a versão web.')
    } else {
      window.open(url, '_blank')
      setShowPdfPreview(false)
    }
  }

  async function handleSaveLayoutConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!layoutConfig) return
    setSavingLayout(true)
    try {
      const updated = await dataService.saveLayoutConfig(layoutConfig)
      setLayoutConfig(updated)
    } catch {
      alert('Erro ao salvar configuração de layout.')
    } finally {
      setSavingLayout(false)
    }
  }

  return (
    <div className="app-container">
      <header>
        <div className="brand">
          <img src={logoAguiar} alt="Aguiar Acessórios" className="brand-logo" />
          <div className="brand-text">
            <span className="brand-name">aguiar</span>
            <span className="brand-subtitle">acessórios</span>
          </div>
        </div>
        <h1>Catálogo de Produtos em PDF</h1>
        <button className="primary" onClick={handlePreviewPdf}>
          Visualizar e gerar PDF
        </button>
      </header>

      <main className="layout">
        <section className="card">
          <h2>{editingId ? 'Editar produto' : 'Novo produto'}</h2>
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleSubmit} className="form">
            <label>
              Nome*
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Descrição
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
              />
            </label>
            <label>
              Valor* (ex: 199,90)
              <input
                name="price"
                value={form.price}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Imagem
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
            <label>
              Categoria
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="Ex: Brincos, Pulseiras"
              />
            </label>
            <label>
              SKU / Código interno (opcional - será gerado automaticamente se vazio)
              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                placeholder="Deixe vazio para gerar automaticamente"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="promotional"
                checked={form.promotional}
                onChange={handleBooleanChange}
              />
              Produto em promoção
            </label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving
                  ? 'Salvando...'
                  : editingId
                  ? 'Salvar alterações'
                  : 'Adicionar produto'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm}>
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card column-card">
          <div className="card-header-row">
            <h2>Produtos cadastrados</h2>
            <div className="product-filters">
              <input
                placeholder="Categoria"
                value={filters.category}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, category: e.target.value }))
                }
              />
              <select
                value={filters.orderBy}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    orderBy: e.target.value as typeof prev.orderBy,
                  }))
                }
              >
                <option value="createdDesc">Mais recentes</option>
                <option value="priceAsc">Preço ↑</option>
                <option value="priceDesc">Preço ↓</option>
                <option value="nameAsc">Nome A–Z</option>
              </select>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={filters.onlyPromotional}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      onlyPromotional: e.target.checked,
                    }))
                  }
                />
                Só promocionais
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => loadProducts()}
              >
                Aplicar
              </button>
            </div>
          </div>
          {loading ? (
            <p>Carregando...</p>
          ) : products.length === 0 ? (
            <p>Nenhum produto cadastrado ainda.</p>
          ) : (
            <ul className="product-list">
              {products.map((p) => (
                <li key={p.id} className="product-item">
                  <div className="product-main">
                    {p.imageUrl && (
                      <img
                        src={p.imageUrl.startsWith('data:') ? p.imageUrl : `${API_BASE}${p.imageUrl}`}
                        alt={p.name}
                        className="thumb"
                      />
                    )}
                    <div>
                      <strong>{p.name}</strong>
                      {p.sku && <span className="sku-badge">{p.sku}</span>}
                      <p className="muted">{p.description}</p>
                      {p.category && (
                        <p className="badge">
                          {p.category}
                          {p.promotional && <span className="badge-pill">Promoção</span>}
                        </p>
                      )}
                      <p className="price">R$ {p.price}</p>
                    </div>
                  </div>
                  <div className="product-actions">
                    <button onClick={() => startEdit(p)}>Editar</button>
                    <button onClick={() => handleDelete(p.id)}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <hr className="divider" />

          <div className="layout-config">
            <h3>Layout do catálogo</h3>
            {layoutConfig && (
              <form onSubmit={handleSaveLayoutConfig} className="layout-form">
                <label>
                  Título da capa
                  <input
                    value={layoutConfig.title}
                    onChange={(e) =>
                      setLayoutConfig({ ...layoutConfig, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Subtítulo
                  <input
                    value={layoutConfig.subtitle}
                    onChange={(e) =>
                      setLayoutConfig({
                        ...layoutConfig,
                        subtitle: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Texto do rodapé
                  <input
                    placeholder="Ex: Uso interno - Aguiar Acessórios"
                    value={layoutConfig.footerText}
                    onChange={(e) =>
                      setLayoutConfig({
                        ...layoutConfig,
                        footerText: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layoutConfig.showLogo}
                    onChange={(e) =>
                      setLayoutConfig({
                        ...layoutConfig,
                        showLogo: e.target.checked,
                      })
                    }
                  />
                  Exibir logo na capa do PDF
                </label>
                <div className="form-actions">
                  <button type="submit" className="primary" disabled={savingLayout}>
                    {savingLayout ? 'Salvando layout...' : 'Salvar layout do PDF'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Modal de Preview do PDF */}
      {showPdfPreview && (
        <div className="modal-overlay" onClick={() => setShowPdfPreview(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Preview do Catálogo PDF</h2>
              <button className="modal-close" onClick={() => setShowPdfPreview(false)}>
                ×
              </button>
            </div>
            <div className="pdf-preview">
              <div className="pdf-preview-page">
                <div className="pdf-header">
                  {layoutConfig?.showLogo && (
                    <div className="pdf-brand">
                      <img src={logoAguiar} alt="Aguiar Acessórios" className="pdf-brand-logo" />
                      <div className="pdf-brand-text">
                        <span className="pdf-brand-name">aguiar</span>
                        <span className="pdf-brand-subtitle">acessórios</span>
                      </div>
                    </div>
                  )}
                  <div className="pdf-title-block">
                    <h1>{layoutConfig?.title || 'Catálogo de Produtos'}</h1>
                    <span>{layoutConfig?.subtitle || 'Gerado automaticamente'}</span>
                  </div>
                </div>
                <div className="pdf-grid">
                  {previewProducts.map((p, index) => (
                    <div
                      key={p.id}
                      className={`pdf-card ${draggedIndex === index ? 'dragging' : ''} ${
                        dragOverIndex === index ? 'drag-over' : ''
                      }`}
                      draggable
                      onDragStart={(e) => {
                        setDraggedIndex(index)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/html', index.toString())
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverIndex(index)
                      }}
                      onDragLeave={() => {
                        setDragOverIndex(null)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        const dragIndex = parseInt(e.dataTransfer.getData('text/html'), 10)
                        if (dragIndex !== index && dragIndex !== null) {
                          const newProducts = [...previewProducts]
                          const [removed] = newProducts.splice(dragIndex, 1)
                          newProducts.splice(index, 0, removed)
                          setPreviewProducts(newProducts)
                        }
                        setDraggedIndex(null)
                        setDragOverIndex(null)
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null)
                        setDragOverIndex(null)
                      }}
                    >
                      <div className="pdf-card-handle">⋮⋮</div>
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl.startsWith('data:') ? p.imageUrl : `${API_BASE}${p.imageUrl}`}
                          alt={p.name}
                        />
                      )}
                      <div className="pdf-name">{p.name}</div>
                      {p.sku && <div className="pdf-sku">{p.sku}</div>}
                      <div className="pdf-description">{p.description || ''}</div>
                      {p.category && (
                        <div className="pdf-category">
                          {p.category}
                          {p.promotional && <span className="pdf-promo-badge">Promoção</span>}
                        </div>
                      )}
                      <div className="pdf-price">R$ {p.price}</div>
                    </div>
                  ))}
                </div>
                {layoutConfig?.footerText && (
                  <div className="pdf-footer">
                    <span>{layoutConfig.footerText}</span>
                    <span>Gerado em {new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowPdfPreview(false)}>
                Cancelar
              </button>
              <button className="primary" onClick={handleGeneratePdf}>
                Gerar e baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
