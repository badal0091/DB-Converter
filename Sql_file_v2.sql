USE ComplexDB;
GO

-- Create schemas
CREATE SCHEMA HR;
CREATE SCHEMA Sales;
CREATE SCHEMA Inventory;
GO

-- Create tables with more advanced relationships
CREATE TABLE HR.Employees (
    EmployeeID INT IDENTITY(1,1) PRIMARY KEY,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    BirthDate DATE,
    HireDate DATE,
    DepartmentID INT,
    Position NVARCHAR(100),
    Salary DECIMAL(18,2),
    IsActive BIT,
    CONSTRAINT FK_Department FOREIGN KEY (DepartmentID) REFERENCES HR.Departments(DepartmentID)
);
GO

CREATE TABLE HR.Departments (
    DepartmentID INT IDENTITY(1,1) PRIMARY KEY,
    DepartmentName NVARCHAR(100),
    ManagerID INT,
    CONSTRAINT FK_Manager FOREIGN KEY (ManagerID) REFERENCES HR.Employees(EmployeeID)
);
GO

CREATE TABLE Sales.Customers (
    CustomerID INT IDENTITY(1,1) PRIMARY KEY,
    CustomerName NVARCHAR(255),
    ContactName NVARCHAR(100),
    Phone NVARCHAR(15),
    Email NVARCHAR(255),
    IsActive BIT
);
GO

CREATE TABLE Sales.Products (
    ProductID INT IDENTITY(1,1) PRIMARY KEY,
    ProductName NVARCHAR(255),
    Price DECIMAL(18, 2),
    StockLevel INT
);
GO

CREATE TABLE Sales.Orders (
    OrderID INT IDENTITY(1,1) PRIMARY KEY,
    CustomerID INT,
    OrderDate DATE,
    TotalAmount DECIMAL(18, 2),
    OrderStatus NVARCHAR(50),
    CONSTRAINT FK_Customer FOREIGN KEY (CustomerID) REFERENCES Sales.Customers(CustomerID)
);
GO

CREATE TABLE Sales.OrderDetails (
    OrderDetailID INT IDENTITY(1,1) PRIMARY KEY,
    OrderID INT,
    ProductID INT,
    Quantity INT,
    UnitPrice DECIMAL(18,2),
    CONSTRAINT FK_Order FOREIGN KEY (OrderID) REFERENCES Sales.Orders(OrderID),
    CONSTRAINT FK_Product FOREIGN KEY (ProductID) REFERENCES Sales.Products(ProductID)
);
GO

CREATE TABLE Inventory.InventoryLogs (
    InventoryLogID INT IDENTITY(1,1) PRIMARY KEY,
    ProductID INT,
    QuantityChange INT,
    DateTime DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Inventory FOREIGN KEY (ProductID) REFERENCES Sales.Products(ProductID)
);
GO

-- Add Full-text indexing to Products table for searching product descriptions
CREATE FULLTEXT CATALOG ProductCatalog AS DEFAULT;
GO

CREATE FULLTEXT INDEX ON Sales.Products(ProductName)
KEY INDEX PK_Products;
GO

-- Create Sequences for tracking order numbers and inventory logs
CREATE SEQUENCE Sales.OrderNumberSeq START WITH 5000 INCREMENT BY 1;
GO

CREATE SEQUENCE Inventory.InventoryLogSeq START WITH 1000 INCREMENT BY 1;
GO

-- Create stored procedures for various business logic
CREATE PROCEDURE HR.sp_AddEmployee
    @FirstName NVARCHAR(100),
    @LastName NVARCHAR(100),
    @DepartmentID INT,
    @Position NVARCHAR(100),
    @Salary DECIMAL(18,2)
AS
BEGIN
    INSERT INTO HR.Employees (FirstName, LastName, DepartmentID, Position, Salary, IsActive)
    VALUES (@FirstName, @LastName, @DepartmentID, @Position, @Salary, 1);
END;
GO

CREATE PROCEDURE Sales.sp_UpdateOrderStatus
    @OrderID INT,
    @Status NVARCHAR(50)
AS
BEGIN
    UPDATE Sales.Orders
    SET OrderStatus = @Status
    WHERE OrderID = @OrderID;
END;
GO

CREATE PROCEDURE Sales.sp_CreateOrder
    @CustomerID INT,
    @OrderDetails Sales.OrderDetails READONLY
AS
BEGIN
    DECLARE @OrderID INT;
    
    INSERT INTO Sales.Orders (CustomerID, OrderDate, TotalAmount, OrderStatus)
    VALUES (@CustomerID, GETDATE(), 0, 'New');
    
    SET @OrderID = SCOPE_IDENTITY();
    
    DECLARE @TotalAmount DECIMAL(18,2) = 0;

    INSERT INTO Sales.OrderDetails (OrderID, ProductID, Quantity, UnitPrice)
    SELECT @OrderID, ProductID, Quantity, UnitPrice
    FROM @OrderDetails;

    SELECT @TotalAmount = SUM(Quantity * UnitPrice) FROM Sales.OrderDetails WHERE OrderID = @OrderID;
    
    UPDATE Sales.Orders
    SET TotalAmount = @TotalAmount
    WHERE OrderID = @OrderID;
END;
GO

-- Create Triggers to automatically log inventory changes and manage stock
CREATE TRIGGER Inventory.trg_InventoryChange
ON Sales.OrderDetails
AFTER INSERT, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ProductID INT, @Quantity INT;
    DECLARE @Change INT;

    -- Handle insert (order placed)
    IF EXISTS (SELECT * FROM inserted)
    BEGIN
        SELECT @ProductID = ProductID, @Quantity = Quantity FROM inserted;
        SET @Change = -@Quantity; -- Decreasing stock on order
    END

    -- Handle delete (order canceled or product returned)
    IF EXISTS (SELECT * FROM deleted)
    BEGIN
        SELECT @ProductID = ProductID, @Quantity = Quantity FROM deleted;
        SET @Change = @Quantity; -- Restocking on order cancelation
    END

    -- Log inventory change
    INSERT INTO Inventory.InventoryLogs (ProductID, QuantityChange)
    VALUES (@ProductID, @Change);

    -- Update product stock level
    UPDATE Sales.Products
    SET StockLevel = StockLevel + @Change
    WHERE ProductID = @ProductID;
END;
GO

-- Complex query with CTE and window functions
WITH SalesCTE AS (
    SELECT o.OrderID, o.OrderDate, od.ProductID, od.Quantity, od.UnitPrice, 
           ROW_NUMBER() OVER (PARTITION BY o.OrderID ORDER BY od.Quantity DESC) AS RowNum
    FROM Sales.Orders o
    JOIN Sales.OrderDetails od ON o.OrderID = od.OrderID
)
SELECT OrderID, OrderDate, ProductID, Quantity, UnitPrice
FROM SalesCTE
WHERE RowNum = 1
ORDER BY OrderDate DESC;
GO

-- Recursive CTE for hierarchical data (Department Management)
WITH RecursiveDept AS (
    SELECT DepartmentID, DepartmentName, ManagerID, 0 AS Level
    FROM HR.Departments
    WHERE ManagerID IS NULL
    UNION ALL
    SELECT d.DepartmentID, d.DepartmentName, d.ManagerID, rd.Level + 1
    FROM HR.Departments d
    INNER JOIN RecursiveDept rd ON d.ManagerID = rd.DepartmentID
)
SELECT * FROM RecursiveDept;
GO

-- Using Transactions with Savepoints and Rollback Example
BEGIN TRANSACTION;
BEGIN TRY
    -- Step 1: Insert a new customer
    INSERT INTO Sales.Customers (CustomerName, ContactName, Phone, Email, IsActive)
    VALUES ('New Customer', 'John Doe', '555-1234', 'john.doe@example.com', 1);

    SAVE TRANSACTION Savepoint1;

    -- Step 2: Insert an order (Potential for failure)
    DECLARE @OrderID INT;
    INSERT INTO Sales.Orders (CustomerID, OrderDate, TotalAmount, OrderStatus)
    VALUES (SCOPE_IDENTITY(), GETDATE(), 100.00, 'Processing');

    -- Force error to test rollback
    -- INTENTIONAL ERROR: Trying to insert with no customer
    INSERT INTO Sales.Orders (CustomerID, OrderDate, TotalAmount, OrderStatus)
    VALUES (9999, GETDATE(), 50.00, 'Pending');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    -- Rollback to Savepoint if error occurs
    ROLLBACK TRANSACTION Savepoint1;
    PRINT 'Transaction rolled back: ' + ERROR_MESSAGE();
END CATCH;
GO
