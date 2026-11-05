-- Creates the empty database structure required by the inventory application.
-- This file contains no customers, employees, passwords, or transaction records.

BEGIN;

CREATE SEQUENCE customers_customer_id_seq;
CREATE SEQUENCE employees_employee_id_seq;
CREATE SEQUENCE expenses_expenses_id_seq;
CREATE SEQUENCE item_item_id_seq;
CREATE SEQUENCE production_production_id_seq;
CREATE SEQUENCE purchases_purchase_id_seq;
CREATE SEQUENCE sales_sales_id_seq;
CREATE SEQUENCE stock_counts_count_id_seq;
CREATE SEQUENCE suppliers_supplier_id_seq;
CREATE SEQUENCE users_user_id_seq;

CREATE TABLE company_details (
    company_id smallint DEFAULT 1 NOT NULL,
    company_name character varying(200) NOT NULL,
    registration_number character varying(100),
    tax_identification_number character varying(100),
    phone_number character varying(50),
    email character varying(255),
    website character varying(255),
    business_address text,
    bank_name character varying(150),
    account_number character varying(50),
    account_name character varying(200),
    logo_path text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT company_details_pkey PRIMARY KEY (company_id),
    CONSTRAINT company_details_company_id_check CHECK (company_id = 1)
);

CREATE TABLE customers (
    customer_id integer DEFAULT nextval('customers_customer_id_seq'::regclass) NOT NULL,
    name character varying(150) NOT NULL,
    phone_number character varying(30),
    address text,
    email character varying(254),
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);

CREATE TABLE employees (
    employee_id integer DEFAULT nextval('employees_employee_id_seq'::regclass) NOT NULL,
    start_date date NOT NULL,
    name character varying(150) NOT NULL,
    phone_number character varying(40) NOT NULL,
    address text NOT NULL,
    email character varying(255),
    role character varying(100) NOT NULL,
    salary numeric(14,2),
    note text,
    department character varying(100),
    status character varying(40) DEFAULT 'Active'::character varying NOT NULL,
    username character varying(100),
    permissions text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    photo_path text,
    CONSTRAINT employees_pkey PRIMARY KEY (employee_id),
    CONSTRAINT employees_username_key UNIQUE (username)
);

CREATE TABLE expenses (
    expense_id integer DEFAULT nextval('expenses_expenses_id_seq'::regclass) NOT NULL,
    expense_date date NOT NULL,
    category text NOT NULL,
    description text,
    amount_spent numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT expenses_pkey PRIMARY KEY (expense_id)
);

CREATE TABLE items (
    item_id integer DEFAULT nextval('item_item_id_seq'::regclass) NOT NULL,
    name text NOT NULL,
    item_type text NOT NULL,
    CONSTRAINT item_pkey PRIMARY KEY (item_id),
    CONSTRAINT item_name_key UNIQUE (name)
);

CREATE TABLE production (
    production_id integer DEFAULT nextval('production_production_id_seq'::regclass) NOT NULL,
    production_date date NOT NULL,
    kernel_used numeric NOT NULL,
    pko_produced numeric NOT NULL,
    pkc_produced numeric NOT NULL,
    production_hours interval,
    down_time interval,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT production_pkey PRIMARY KEY (production_id),
    CONSTRAINT unique_production_date UNIQUE (production_date)
);

CREATE TABLE suppliers (
    supplier_id integer DEFAULT nextval('suppliers_supplier_id_seq'::regclass) NOT NULL,
    name character varying(150) NOT NULL,
    phone_number character varying(30),
    address text,
    email character varying(254),
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id)
);

CREATE TABLE users (
      user_id integer
          DEFAULT
  nextval('users_user_id_seq'::regclass)
          NOT NULL,
 
      username character varying(100) NOT NULL,
 
      password_hash text NOT NULL,
 
      role character varying(50) NOT NULL,

      created_at timestamp without time zone
          DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT users_pkey
          PRIMARY KEY (user_id),

      CONSTRAINT users_username_key
          UNIQUE (username)
  );

CREATE TABLE purchases (
    purchase_id integer DEFAULT nextval('purchases_purchase_id_seq'::regclass) NOT NULL,
    purchase_date date NOT NULL,
    item_id integer,
    quantity_supplied numeric NOT NULL,
    unit_cost numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    supplier_id integer NOT NULL,
    CONSTRAINT purchases_pkey PRIMARY KEY (purchase_id),
    CONSTRAINT purchases_material_supplied_fkey FOREIGN KEY (item_id) REFERENCES items(item_id),
    CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

CREATE TABLE sales (
    sales_id integer DEFAULT nextval('sales_sales_id_seq'::regclass) NOT NULL,
    sales_date date NOT NULL,
    item_id integer,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    customer_id integer NOT NULL,
    CONSTRAINT sales_pkey PRIMARY KEY (sales_id),
    CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT sales_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id)
);

CREATE TABLE session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX "IDX_session_expire" ON session USING btree (expire);

CREATE TABLE stock_counts (
    count_id integer DEFAULT nextval('stock_counts_count_id_seq'::regclass) NOT NULL,
    count_date date NOT NULL,
    item_id integer,
    received numeric NOT NULL,
    issued numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT stock_counts_pkey PRIMARY KEY (count_id),
    CONSTRAINT stock_counts_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id)
);

ALTER SEQUENCE customers_customer_id_seq OWNED BY customers.customer_id;
ALTER SEQUENCE employees_employee_id_seq OWNED BY employees.employee_id;
ALTER SEQUENCE expenses_expenses_id_seq OWNED BY expenses.expense_id;
ALTER SEQUENCE item_item_id_seq OWNED BY items.item_id;
ALTER SEQUENCE production_production_id_seq OWNED BY production.production_id;
ALTER SEQUENCE purchases_purchase_id_seq OWNED BY purchases.purchase_id;
ALTER SEQUENCE sales_sales_id_seq OWNED BY sales.sales_id;
ALTER SEQUENCE stock_counts_count_id_seq OWNED BY stock_counts.count_id;
ALTER SEQUENCE suppliers_supplier_id_seq OWNED BY suppliers.supplier_id;
ALTER SEQUENCE users_user_id_seq OWNED BY users.user_id;

COMMIT;
