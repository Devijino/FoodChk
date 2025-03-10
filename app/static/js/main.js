/**
 * FoodChecker - Main JavaScript file
 * Handles the client-side logic for food search and display
 */

// Global state variables
let currentPage = 1;
const perPage = 20;
let lastQuery = '';
let totalPages = 0;
let columnNames = null;

// DOM elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const foodResults = document.getElementById('food-results');
const pagination = document.getElementById('pagination');
const loadingSpinner = document.querySelector('.loading-spinner');
const noResults = document.getElementById('no-results');

// Column mapping for different possible CSV structures
const columnMappings = {
    // Product name alternatives - עדכון שמות עמודות בעברית
    nameColumns: ['shmmitzrach', 'שם_המוצר', 'שם_המזון', 'שם', 'product_name', 'name', 'שם המזון', 'שם מזון', 'שם המוצר', 'מזון', 'תאור'],
    
    // Nutrition alternatives
    caloriesColumns: ['food_energy', 'קלוריות', 'calories', 'אנרגיה', 'energy', 'קלוריות_ל_100_גרם', 'ערך קלורי', 'אנרגיה למזון'],
    proteinColumns: ['protein', 'חלבון', 'proteins', 'חלבונים', 'חלבון כולל'],
    carbsColumns: ['carbohydrates', 'פחמימות', 'carbs', 'סוכרים', 'sugars', 'פחמימות כולל', 'total_carbohydrates'],
    fatColumns: ['total_fat', 'שומן', 'fat', 'fats', 'שומנים', 'שומן_רווי', 'saturated_fat', 'שומן כולל']
};

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Get column information from API
    fetchColumnInfo()
        .then(() => {
            // Load initial data after getting columns
            fetchFoodData();
        })
        .catch(() => {
            // If columns fetch fails, try to load data anyway
            fetchFoodData();
        });
    
    // Add search button click handler
    searchBtn.addEventListener('click', handleSearch);
    
    // Add enter key handler for search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // Add debounce for search as user types
    searchInput.addEventListener('input', debounce(handleSearch, 500));
});

/**
 * Fetch column information from API
 */
async function fetchColumnInfo() {
    try {
        const response = await fetch('/api/columns');
        
        if (!response.ok) {
            throw new Error('Failed to fetch column information');
        }
        
        const data = await response.json();
        columnNames = data.columns;
        console.log('Available columns:', columnNames);
    } catch (error) {
        console.warn('Could not fetch column information:', error);
    }
}

/**
 * Debounce function to limit API calls during typing
 */
function debounce(func, delay) {
    let timeoutId;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, delay);
    };
}

/**
 * Handles the search action
 */
function handleSearch() {
    const query = searchInput.value.trim();
    
    // Reset pagination when query changes
    if (query !== lastQuery) {
        currentPage = 1;
    }
    
    lastQuery = query;
    fetchFoodData(query, currentPage);
}

/**
 * Fetches food data from the API
 */
function fetchFoodData(query = '', page = 1) {
    // Show loading spinner
    loadingSpinner.classList.remove('d-none');
    noResults.classList.add('d-none');
    
    // Build API URL
    const url = `/api/food?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
    
    // Fetch data from API
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Update UI with results
            displayResults(data.data);
            
            // Update pagination
            totalPages = data.total_pages;
            renderPagination(data.page, data.total_pages);
            
            // Show no results message if needed
            if (data.data.length === 0) {
                noResults.classList.remove('d-none');
            }
        })
        .catch(error => {
            console.error('Error fetching food data:', error);
            alert('אירעה שגיאה בטעינת הנתונים. אנא נסה שוב מאוחר יותר.');
        })
        .finally(() => {
            // Hide loading spinner
            loadingSpinner.classList.add('d-none');
        });
}

/**
 * Get value from food object using column mapping
 */
function getFoodValue(food, mappingKey, defaultValue = 'לא צוין') {
    // Add logging to debug column detection
    console.log(`Trying to find ${mappingKey} in food object:`, Object.keys(food));
    
    // First, try direct match with column names we know
    for (const colName of columnMappings[mappingKey]) {
        if (food[colName] !== undefined && food[colName] !== null && food[colName] !== '') {
            console.log(`Found ${mappingKey} in column ${colName}: ${food[colName]}`);
            return food[colName];
        }
    }
    
    // If column names are available, try them too
    if (columnNames) {
        console.log('Available columns from API:', columnNames);
        
        // Find similar columns by partial match
        for (const col of columnNames) {
            // Check each available column against our column mappings
            for (const mappingCol of columnMappings[mappingKey]) {
                // Check if column name contains the mapping key (either way)
                if (col.toLowerCase().includes(mappingCol.toLowerCase()) || 
                    mappingCol.toLowerCase().includes(col.toLowerCase())) {
                    if (food[col] !== undefined && food[col] !== null && food[col] !== '') {
                        console.log(`Found ${mappingKey} by partial match in column ${col}: ${food[col]}`);
                        return food[col];
                    }
                }
            }
        }
    }
    
    // Special case for shmmitzrach column in Hebrew CSV
    if (mappingKey === 'nameColumns' && food['shmmitzrach'] !== undefined && 
        food['shmmitzrach'] !== null && food['shmmitzrach'] !== '') {
        console.log(`Found name in shmmitzrach column: ${food['shmmitzrach']}`);
        return food['shmmitzrach'];
    }
    
    // Last resort - try to find any column that might contain the food name
    if (mappingKey === 'nameColumns') {
        const possibleNameColumns = ['תיאור', 'שם', 'מזון', 'תאור', 'תיאור_המזון', 'מוצר'];
        for (const key of Object.keys(food)) {
            if (possibleNameColumns.some(term => key.toLowerCase().includes(term.toLowerCase()))) {
                if (food[key] !== undefined && food[key] !== null && food[key] !== '') {
                    console.log(`Found potential name in column ${key}: ${food[key]}`);
                    return food[key];
                }
            }
        }
    }
    
    // If all else fails, try to find the first non-empty string column
    if (mappingKey === 'nameColumns') {
        for (const key of Object.keys(food)) {
            if (typeof food[key] === 'string' && food[key].length > 3 && isNaN(food[key])) {
                console.log(`Using fallback string column ${key} as name: ${food[key]}`);
                return food[key];
            }
        }
    }
    
    console.log(`Could not find ${mappingKey}, using default: ${defaultValue}`);
    return defaultValue;
}

/**
 * Check if a food should be approved based on its properties
 */
function isApprovedFood(food) {
    const name = getFoodValue(food, 'nameColumns', '').toString().toLowerCase();
    
    // Get calories value and convert to number if possible
    const caloriesValue = getFoodValue(food, 'caloriesColumns', '0');
    const calories = parseFloat(caloriesValue);
    
    // Check for restricted foods by name
    const restrictedTerms = [
        'ממתק', 'חטיף', 'ממוזג', 'sugar', 'סוכר', 'שוקולד', 'קולה',
        'מטוגן', 'צ\'יפס', 'בירה', 'ויסקי', 'אלכוהול', 'alcohol',
        'עוגה', 'עוגיות', 'ממרח', 'מרגרינה', 'אינסטנט', 'נקניק'
    ];
    
    // Check if any restricted term appears in the name
    const containsRestrictedTerm = restrictedTerms.some(term => 
        name.includes(term)
    );
    
    // Food is approved if it doesn't contain restricted terms and has reasonable calories
    const hasReasonableCalories = isNaN(calories) || calories < 300;
    
    return !containsRestrictedTerm && hasReasonableCalories;
}

/**
 * Displays food results in the table
 */
function displayResults(foods) {
    // Clear previous results
    foodResults.innerHTML = '';
    
    // Add each food item to the table
    foods.forEach(food => {
        const row = document.createElement('tr');
        
        // Get food properties with fallbacks
        const name = getFoodValue(food, 'nameColumns');
        const calories = getFoodValue(food, 'caloriesColumns');
        const protein = getFoodValue(food, 'proteinColumns');
        const carbs = getFoodValue(food, 'carbsColumns');
        const fat = getFoodValue(food, 'fatColumns');
        
        // Determine if food is approved or restricted
        const isApproved = isApprovedFood(food);
        
        const statusIcon = isApproved ? 
            '<span class="status-approved"><i class="fas fa-check-circle"></i></span>' : 
            '<span class="status-restricted"><i class="fas fa-times-circle"></i></span>';
        
        // Build row HTML
        row.innerHTML = `
            <td>${name}</td>
            <td>${calories}</td>
            <td>${protein}</td>
            <td>${carbs}</td>
            <td>${fat}</td>
            <td class="text-center">${statusIcon}</td>
        `;
        
        foodResults.appendChild(row);
    });
}

/**
 * Renders pagination controls
 */
function renderPagination(currentPage, totalPages) {
    pagination.innerHTML = '';
    
    // Don't show pagination if there's only one page
    if (totalPages <= 1) {
        return;
    }
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = '<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>';
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            goToPage(currentPage - 1);
        }
    });
    pagination.appendChild(prevLi);
    
    // Page numbers
    const maxVisiblePages = window.innerWidth < 768 ? 3 : 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust if we're at the end
    if (endPage - startPage + 1 < maxVisiblePages && startPage > 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page if not included
    if (startPage > 1) {
        const firstLi = document.createElement('li');
        firstLi.className = 'page-item';
        firstLi.innerHTML = '<a class="page-link" href="#">1</a>';
        firstLi.addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(1);
        });
        pagination.appendChild(firstLi);
        
        // Add ellipsis if needed
        if (startPage > 2) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = '<a class="page-link" href="#">...</a>';
            pagination.appendChild(ellipsisLi);
        }
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
        pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        pageLi.addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(i);
        });
        pagination.appendChild(pageLi);
    }
    
    // Add last page if not included
    if (endPage < totalPages) {
        // Add ellipsis if needed
        if (endPage < totalPages - 1) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = '<a class="page-link" href="#">...</a>';
            pagination.appendChild(ellipsisLi);
        }
        
        const lastLi = document.createElement('li');
        lastLi.className = 'page-item';
        lastLi.innerHTML = `<a class="page-link" href="#">${totalPages}</a>`;
        lastLi.addEventListener('click', (e) => {
            e.preventDefault();
            goToPage(totalPages);
        });
        pagination.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = '<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>';
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            goToPage(currentPage + 1);
        }
    });
    pagination.appendChild(nextLi);
}

/**
 * Navigates to a specific page
 */
function goToPage(page) {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
        currentPage = page;
        fetchFoodData(lastQuery, currentPage);
        // Scroll to top of results
        document.querySelector('.results-container').scrollIntoView({ behavior: 'smooth' });
    }
} 