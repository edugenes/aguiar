import { isMobile } from '../utils/platform';

// Detecta automaticamente a URL da API:
// - Produção: domínio aguiaracessorios.com.br → Railway
// - Dev: localhost → backend local
const API_BASE = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Produção: site em aguiaracessorios.com.br chamando backend no Railway
    if (host.endsWith('aguiaracessorios.com.br')) {
      return 'https://aguiar-production.up.railway.app';
    }
    // Se existir variável de ambiente VITE_API_BASE, usa ela
    const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    if (envBase) return envBase;
  }
  // Padrão: desenvolvimento local
  return 'http://localhost:4000';
})();

// Interface para produtos
export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
  category: string;
  sku: string;
  promotional: boolean;
}

export interface LayoutConfig {
  title: string;
  subtitle: string;
  showLogo: boolean;
  footerText: string;
}

// Serviço de dados que funciona tanto no web quanto no mobile
class DataService {
  private useLocalStorage = isMobile();

  // Produtos
  async getProducts(filters?: {
    category?: string;
    onlyPromotional?: boolean;
    orderBy?: string;
  }): Promise<Product[]> {
    if (this.useLocalStorage) {
      return this.getProductsFromStorage(filters);
    }
    return this.getProductsFromAPI(filters);
  }

  private async getProductsFromAPI(filters?: {
    category?: string;
    onlyPromotional?: boolean;
    orderBy?: string;
  }): Promise<Product[]> {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.onlyPromotional) params.set('onlyPromotional', 'true');
    if (filters?.orderBy) params.set('orderBy', filters.orderBy);

    const res = await fetch(`${API_BASE}/products?${params.toString()}`);
    if (!res.ok) throw new Error('Erro ao carregar produtos');
    return res.json();
  }

  private async getProductsFromStorage(filters?: {
    category?: string;
    onlyPromotional?: boolean;
    orderBy?: string;
  }): Promise<Product[]> {
    const stored = localStorage.getItem('products');
    let products: Product[] = stored ? JSON.parse(stored) : [];

    // Aplicar filtros
    if (filters?.category) {
      products = products.filter((p) => p.category === filters.category);
    }
    if (filters?.onlyPromotional) {
      products = products.filter((p) => p.promotional);
    }

    // Aplicar ordenação
    if (filters?.orderBy === 'priceAsc') {
      products.sort((a, b) => {
        const priceA = parseFloat(a.price.replace(',', '.'));
        const priceB = parseFloat(b.price.replace(',', '.'));
        return priceA - priceB;
      });
    } else if (filters?.orderBy === 'priceDesc') {
      products.sort((a, b) => {
        const priceA = parseFloat(a.price.replace(',', '.'));
        const priceB = parseFloat(b.price.replace(',', '.'));
        return priceB - priceA;
      });
    } else if (filters?.orderBy === 'nameAsc') {
      products.sort((a, b) => a.name.localeCompare(b.name));
    }

    return products;
  }

  async createProduct(product: Omit<Product, 'id'>): Promise<Product> {
    if (this.useLocalStorage) {
      return this.createProductInStorage(product);
    }
    return this.createProductInAPI(product);
  }

  private async createProductInAPI(product: Omit<Product, 'id'>): Promise<Product> {
    const formData = new FormData();
    formData.append('name', product.name);
    formData.append('description', product.description);
    formData.append('price', product.price);
    formData.append('category', product.category);
    formData.append('sku', product.sku);
    formData.append('promotional', String(product.promotional));

    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Erro ao criar produto');
    return res.json();
  }

  private async createProductInStorage(product: Omit<Product, 'id'>): Promise<Product> {
    const stored = localStorage.getItem('products');
    const products: Product[] = stored ? JSON.parse(stored) : [];
    const newId = products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1;
    const newProduct: Product = { ...product, id: newId };
    products.push(newProduct);
    localStorage.setItem('products', JSON.stringify(products));
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<Product> {
    if (this.useLocalStorage) {
      return this.updateProductInStorage(id, product);
    }
    return this.updateProductInAPI(id, product);
  }

  private async updateProductInAPI(id: number, product: Partial<Product>): Promise<Product> {
    const formData = new FormData();
    if (product.name) formData.append('name', product.name);
    if (product.description !== undefined) formData.append('description', product.description);
    if (product.price) formData.append('price', product.price);
    if (product.category !== undefined) formData.append('category', product.category);
    if (product.sku !== undefined) formData.append('sku', product.sku);
    if (product.promotional !== undefined)
      formData.append('promotional', String(product.promotional));

    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      body: formData,
    });
    if (!res.ok) throw new Error('Erro ao atualizar produto');
    return res.json();
  }

  private async updateProductInStorage(id: number, product: Partial<Product>): Promise<Product> {
    const stored = localStorage.getItem('products');
    const products: Product[] = stored ? JSON.parse(stored) : [];
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Produto não encontrado');
    products[index] = { ...products[index], ...product };
    localStorage.setItem('products', JSON.stringify(products));
    return products[index];
  }

  async deleteProduct(id: number): Promise<void> {
    if (this.useLocalStorage) {
      return this.deleteProductFromStorage(id);
    }
    return this.deleteProductFromAPI(id);
  }

  private async deleteProductFromAPI(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Erro ao excluir produto');
  }

  private async deleteProductFromStorage(id: number): Promise<void> {
    const stored = localStorage.getItem('products');
    const products: Product[] = stored ? JSON.parse(stored) : [];
    const filtered = products.filter((p) => p.id !== id);
    localStorage.setItem('products', JSON.stringify(filtered));
  }

  // Layout Config
  async getLayoutConfig(): Promise<LayoutConfig> {
    if (this.useLocalStorage) {
      return this.getLayoutConfigFromStorage();
    }
    return this.getLayoutConfigFromAPI();
  }

  private async getLayoutConfigFromAPI(): Promise<LayoutConfig> {
    const res = await fetch(`${API_BASE}/layout-config`);
    if (!res.ok) throw new Error('Erro ao carregar configuração');
    return res.json();
  }

  private async getLayoutConfigFromStorage(): Promise<LayoutConfig> {
    const stored = localStorage.getItem('layoutConfig');
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      title: 'Catálogo de Produtos',
      subtitle: 'Gerado automaticamente',
      showLogo: true,
      footerText: '',
    };
  }

  async saveLayoutConfig(config: LayoutConfig): Promise<LayoutConfig> {
    if (this.useLocalStorage) {
      return this.saveLayoutConfigInStorage(config);
    }
    return this.saveLayoutConfigInAPI(config);
  }

  private async saveLayoutConfigInAPI(config: LayoutConfig): Promise<LayoutConfig> {
    const res = await fetch(`${API_BASE}/layout-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Erro ao salvar configuração');
    return res.json();
  }

  private async saveLayoutConfigInStorage(config: LayoutConfig): Promise<LayoutConfig> {
    localStorage.setItem('layoutConfig', JSON.stringify(config));
    return config;
  }

  // Geração de PDF (no mobile, pode usar uma biblioteca JS ou abrir em navegador)
  generatePdfUrl(filters?: {
    category?: string;
    onlyPromotional?: boolean;
    orderBy?: string;
  }): string {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.onlyPromotional) params.set('onlyPromotional', 'true');
    if (filters?.orderBy) params.set('orderBy', filters.orderBy);

    if (this.useLocalStorage) {
      // No mobile, podemos gerar o PDF localmente ou abrir em navegador
      return `#pdf?${params.toString()}`;
    }
    return `${API_BASE}/catalog/pdf?${params.toString()}`;
  }
}

export const dataService = new DataService();
