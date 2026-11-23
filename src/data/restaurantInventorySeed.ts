import { type InventoryCategory } from '../types/domain';

export interface RestaurantSeedItem {
  category: InventoryCategory;
  name: string;
  unit: string;
}

export const RESTAURANT_INVENTORY_SEED: RestaurantSeedItem[] = [
  // Proteínas
  { category: 'Proteínas', name: 'Frango desfiado', unit: 'kg' },
  { category: 'Proteínas', name: 'Bacon', unit: 'kg' },
  { category: 'Proteínas', name: 'Carne moida', unit: 'kg' },
  { category: 'Proteínas', name: 'Presunto', unit: 'kg' },
  { category: 'Proteínas', name: 'Peito de Peru', unit: 'kg' },
  { category: 'Proteínas', name: 'Calabresa', unit: 'kg' },
  { category: 'Proteínas', name: 'Atum lata', unit: 'lata' },
  { category: 'Proteínas', name: 'Carne Seca', unit: 'kg' },
  { category: 'Proteínas', name: 'Recheio Camarão', unit: 'kg' },
  { category: 'Proteínas', name: 'Ovos in Natura (und)', unit: 'und' },

  // Queijos
  { category: 'Queijos', name: 'Mucarela', unit: 'kg' },
  { category: 'Queijos', name: 'Catupiry Bag', unit: 'bag' },
  { category: 'Queijos', name: 'Catupiry Bisnaga', unit: 'bisnaga' },
  { category: 'Queijos', name: 'Provolone', unit: 'kg' },
  { category: 'Queijos', name: 'Gorgonzola', unit: 'kg' },
  { category: 'Queijos', name: 'Minas', unit: 'kg' },
  { category: 'Queijos', name: 'Parmesão', unit: 'kg' },
  { category: 'Queijos', name: 'Creme de Queijos', unit: 'kg' },
  { category: 'Queijos', name: 'Queijo Cheddar Cremoso', unit: 'kg' },

  // Estoque Seco
  { category: 'Estoque Seco', name: 'Mistura Ovo e Leite em pó', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Leite em pó', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Ovo em pó', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Farinha de Trigo', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Açucar', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Sal', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Creme de Leite', unit: 'und' },
  { category: 'Estoque Seco', name: 'Azeite 500 ml', unit: 'und' },
  { category: 'Estoque Seco', name: 'Palmito 500 gr', unit: 'und' },
  { category: 'Estoque Seco', name: 'Azeitona', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Orégano 200 gr', unit: 'pct' },
  { category: 'Estoque Seco', name: 'Passas', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Caldo Knor 114gr - 12 tabletes', unit: 'cx' },
  { category: 'Estoque Seco', name: 'Curry em Pó', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Milho', unit: 'und' },
  { category: 'Estoque Seco', name: 'Mostarda 3kg', unit: 'und' },
  { category: 'Estoque Seco', name: 'Mel 250 ml', unit: 'und' },
  { category: 'Estoque Seco', name: 'Leite Condensado caixinha', unit: 'und' },
  { category: 'Estoque Seco', name: 'Goma Tapioca', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Batata chips', unit: 'pct' },
  { category: 'Estoque Seco', name: 'Maionese', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Castanha', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Crocante', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Mix de Castanhas', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Cha Mate 500 gr', unit: 'pct' },
  { category: 'Estoque Seco', name: 'Agua Potavel ml', unit: 'ml' },
  { category: 'Estoque Seco', name: 'Arroz Branco', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Alho', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Fecula de batata', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Leite integral', unit: 'L' },
  { category: 'Estoque Seco', name: 'Margarina', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Batata Chips (Fardo)', unit: 'pct' },
  { category: 'Estoque Seco', name: 'Farinha Panko', unit: 'kg' },
  { category: 'Estoque Seco', name: 'Extrato de Tomate 300 gr', unit: 'und' },
  { category: 'Estoque Seco', name: 'Capsula de Café', unit: 'und' },

  // Hortifruti
  { category: 'Hortifruti', name: 'Alface Americana', unit: 'und' },
  { category: 'Hortifruti', name: 'Alface Crespa', unit: 'und' },
  { category: 'Hortifruti', name: 'Rucula', unit: 'maço' },
  { category: 'Hortifruti', name: 'Tomate', unit: 'kg' },
  { category: 'Hortifruti', name: 'Cebola', unit: 'kg' },
  { category: 'Hortifruti', name: 'Manjericão', unit: 'maço' },
  { category: 'Hortifruti', name: 'Laranja', unit: 'kg' },
  { category: 'Hortifruti', name: 'Morango', unit: 'cx' },
  { category: 'Hortifruti', name: 'Banana', unit: 'kg' },
  { category: 'Hortifruti', name: 'Cenoura', unit: 'kg' },
  { category: 'Hortifruti', name: 'Salsa', unit: 'maço' },
  { category: 'Hortifruti', name: 'Abacaxi', unit: 'und' },
  { category: 'Hortifruti', name: 'Alho poró', unit: 'und' },
  { category: 'Hortifruti', name: 'Gengibre', unit: 'kg' },

  // Doces
  { category: 'Doces', name: 'Doce de Leite', unit: 'kg' },
  { category: 'Doces', name: 'Brigadeiro Branco', unit: 'kg' },
  { category: 'Doces', name: 'Chocolate em Barra', unit: 'kg' },
  { category: 'Doces', name: 'Biscoito Maisena', unit: 'pct' },
  { category: 'Doces', name: 'Coco Ralado', unit: 'kg' },
  { category: 'Doces', name: 'Nutella', unit: 'kg' },
  { category: 'Doces', name: 'Galak', unit: 'kg' },
  { category: 'Doces', name: 'Goiabada', unit: 'kg' },

  // Embalagem
  { category: 'Embalagem', name: 'Caixinha delivery', unit: 'und' },
  { category: 'Embalagem', name: 'Lamina delivery', unit: 'und' },
  { category: 'Embalagem', name: 'Copo 300', unit: 'und' },
  { category: 'Embalagem', name: 'Copo 500', unit: 'und' },
  { category: 'Embalagem', name: 'Canudo', unit: 'und' },
  { category: 'Embalagem', name: 'Guardanapo', unit: 'und' },
  { category: 'Embalagem', name: 'Saco Viagem', unit: 'und' },
  { category: 'Embalagem', name: 'Talher Descartavel', unit: 'und' },
  { category: 'Embalagem', name: 'Saco Talher', unit: 'und' },
  { category: 'Embalagem', name: 'Lâmina Bandeja', unit: 'und' },
  { category: 'Embalagem', name: 'Lacre Viagem', unit: 'und' },
  { category: 'Embalagem', name: 'Pote com tampa p/ manteiga', unit: 'und' },
  { category: 'Embalagem', name: 'Embalagem salada inteira', unit: 'und' },
  { category: 'Embalagem', name: 'Embalagem meia salada', unit: 'und' },
  { category: 'Embalagem', name: 'Embalagem Tapioca', unit: 'und' },
  { category: 'Embalagem', name: 'Embalagem Crepe na Mão', unit: 'und' },
  { category: 'Embalagem', name: 'Embalagem Wrap', unit: 'und' },

  // Outros Congelados e Resfriados
  { category: 'Outros Congelados e Resfriados', name: 'Morango Congelado', unit: 'kg' },
  { category: 'Outros Congelados e Resfriados', name: 'Margarina 500 gr', unit: 'und' },
  { category: 'Outros Congelados e Resfriados', name: 'Sorvete Pote', unit: 'und' },

  // Molhos
  { category: 'Molhos', name: 'Molho Branco', unit: 'kg' },
  { category: 'Molhos', name: 'Molho Tomate', unit: 'kg' },
  { category: 'Molhos', name: 'Molho Caesar', unit: 'kg' },

  // Basicos Delivery
  { category: 'Basicos Delivery', name: 'Saco Viagem', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Guardanapo', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Caixinha Viagem', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Embalagem Meia Salada', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Embalagem Salada Inteira', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Lacre Viagem', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Pote Manteiga', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Garrafinha suco 500 ml', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Garrafinha suco 300 ml', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Copinho 50ml', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Garfo/faca Descartável', unit: 'und' },
  { category: 'Basicos Delivery', name: 'Total Kit Básico de Viagem', unit: 'kit' },

  // Polpas e Açaí
  { category: 'Polpas e Açaí', name: 'Polpa Maracujá', unit: 'kg' },
  { category: 'Polpas e Açaí', name: 'Polpa Manga', unit: 'kg' },
  { category: 'Polpas e Açaí', name: 'Açaí com guaraná', unit: 'kg' },
];
