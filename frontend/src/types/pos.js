// POS Type definitions (using JSDoc for type hints)

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} role
 * @property {string} cafe_id
 */

/**
 * @typedef {Object} Cafe
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {string} phone
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} cafe_id
 */

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} name
 * @property {number} price
 * @property {string} category_id
 * @property {string} description
 * @property {string} image_url
 * @property {boolean} available
 * @property {string} cafe_id
 * @property {Array} variants
 * @property {Array} addons
 */

/**
 * @typedef {Object} Table
 * @property {string} id
 * @property {string} name
 * @property {string} floor_id
 * @property {number} capacity
 * @property {string} status
 * @property {string} cafe_id
 * @property {string} current_order_id
 */

/**
 * @typedef {Object} Floor
 * @property {string} id
 * @property {string} name
 * @property {string} cafe_id
 */

/**
 * @typedef {Object} OrderItem
 * @property {string} menu_item_id
 * @property {string} menu_item_name
 * @property {number} quantity
 * @property {number} price
 * @property {Array} variants
 * @property {Array} addons
 * @property {string} notes
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} cafe_id
 * @property {string} table_id
 * @property {Array<OrderItem>} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} total
 * @property {string} status
 */

/**
 * @typedef {Object} Bill
 * @property {string} id
 * @property {number} bill_number
 * @property {string} cafe_id
 * @property {string} table_id
 * @property {Array<OrderItem>} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} tax_percentage
 * @property {number} total
 * @property {string} payment_method
 * @property {string} bill_hash
 * @property {boolean} cloud_synced
 * @property {string} created_at
 */

/**
 * @typedef {Object} Reservation
 * @property {string} id
 * @property {string} cafe_id
 * @property {string} table_id
 * @property {string} customer_name
 * @property {string} customer_phone
 * @property {number} guest_count
 * @property {string} reservation_date
 * @property {string} reservation_time
 * @property {string} status
 * @property {string} notes
 */

/**
 * @typedef {Object} DaySession
 * @property {string} id
 * @property {string} cafe_id
 * @property {string} session_date
 * @property {number} opening_cash
 * @property {number} closing_cash
 * @property {number} expected_cash
 * @property {number} total_sales
 * @property {number} total_bills
 * @property {string} status
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id
 * @property {string} name
 * @property {string} cafe_id
 * @property {string} unit
 * @property {number} current_stock
 * @property {number} min_stock
 * @property {number} max_stock
 * @property {number} cost_per_unit
 */

export {};
